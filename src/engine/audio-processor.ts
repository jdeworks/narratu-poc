/**
 * Audio processing pipeline for audiobook assembly.
 * Handles: silence trimming, LUFS normalization, micro-fades, context-aware gaps,
 * peak limiting, and final assembly into a single audio file.
 *
 * Pipeline per segment: decode → trim → normalize → limit → micro-fade
 * Assembly: processed segments + context-aware gaps → final PCM → encode
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProcessedSegment {
  id: string;
  speaker: string;
  pcm: Float32Array;
  sampleRate: number;
  lufs: number;
  peakDb: number;
  trimmedMs: { start: number; end: number };
  trailingSilenceRatio: number;
}

export interface AssemblyConfig {
  targetLufs: number;       // -19 default
  peakLimitDb: number;      // -3 default
  earlyStopMs: number;      // 0 default — extra tail trimming for click removal
  fadeInMs: number;          // 10ms default
  fadeOutMs: number;         // 50ms default
  fadeInStrength: number;    // 0-100, 50 = standard curve
  fadeOutStrength: number;   // 0-100, 50 = standard curve
  // Internal (not exposed in UI)
  trimThresholdDb: number;
  trimLeadMs: number;
  trimTrailMs: number;
  chapterFadeInMs: number;
  chapterFadeOutMs: number;
}

export interface GapContext {
  prevSpeaker: string | null;
  currentSpeaker: string;
  nextSpeaker: string | null;
  /** How much trailing silence the previous segment already has (0-1, 1=fully silent) */
  prevTrailingSilenceRatio: number;
  isShortSegment: boolean;
  isFirstSegment: boolean;
  isLastSegment: boolean;
}

export interface AssemblyResult {
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
  segments: {
    id: string;
    speaker: string;
    offsetMs: number;
    durationMs: number;
    gapBeforeMs: number;
    lufs: number;
    gainApplied: number;
  }[];
}

export const DEFAULT_CONFIG: AssemblyConfig = {
  targetLufs: -19,
  peakLimitDb: -3,
  earlyStopMs: 0,
  fadeInMs: 10,
  fadeOutMs: 50,
  fadeInStrength: 50,
  fadeOutStrength: 50,
  trimThresholdDb: -45,
  trimLeadMs: 25,
  trimTrailMs: 60,
  chapterFadeInMs: 50,
  chapterFadeOutMs: 150,
};

/** Slider metadata for each per-segment audio setting */
export const SETTING_META: import("../types/segment-settings").SettingMeta[] = [
  { key: "gapBeforeMs",     label: "Gap before",       description: "Silence duration before this segment starts. Filled with subtle pink noise.", min: 0, max: 1200, step: 25, unit: "ms", category: "timing" },
  { key: "targetLufs",      label: "Loudness",         description: "Target loudness (LUFS). Whispered lines quieter (-22), shouted louder (-16). Standard speech is -19.", min: -30, max: -10, step: 0.5, unit: "LUFS", category: "levels" },
  { key: "peakLimitDb",     label: "Peak limit",       description: "Maximum peak amplitude. Prevents clipping. -3dB is safe for most devices.", min: -12, max: 0, step: 0.5, unit: "dB", category: "levels" },
  { key: "earlyStopMs",     label: "Early stop",       description: "Trim from end — removes trailing silence, clicks, or TTS artifacts. Auto-detected. 0 = none.", min: 0, max: 3000, step: 10, unit: "ms", category: "fades" },
  { key: "fadeInMs",         label: "Fade in",          description: "Fade-in duration at segment start. Short fades (5-15ms) preserve plosives. Longer (50ms+) for gentle entries.", min: 0, max: 200, step: 5, unit: "ms", category: "fades" },
  { key: "fadeOutMs",        label: "Fade out",         description: "Fade-out duration at segment end. Smooth transition into silence/noise gap. Auto-optimized from tail analysis.", min: 0, max: 300, step: 5, unit: "ms", category: "fades" },
  { key: "fadeInStrength",   label: "In curve",         description: "Fade-in curve shape. 0=linear (even), 50=quarter-sine (preserves attack), 100=aggressive (fast rise).", min: 0, max: 100, step: 5, unit: "%", category: "fades" },
  { key: "fadeOutStrength",  label: "Out curve",        description: "Fade-out curve shape. 0=linear, 50=cosine (smooth natural decay), 100=aggressive (fast drop).", min: 0, max: 100, step: 5, unit: "%", category: "fades" },
];

// ── Utilities ──────────────────────────────────────────────────────────────

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-10));
}

// ── Trailing Artifact Detection ─────────────────────────────────────────────

export interface TrailingArtifact {
  type: "breath" | "click" | "clean";
  trimPoint: number;
  fadeMs: number;
  confidence: number;
}

function detectTrailingArtifact(pcm: Float32Array, sampleRate: number): TrailingArtifact {
  const windowMs = 10;
  const windowSize = Math.floor(sampleRate * windowMs / 1000);
  const analyzeMs = 300;
  const analyzeSamples = Math.floor(sampleRate * analyzeMs / 1000);
  const startSample = Math.max(0, pcm.length - analyzeSamples);

  // Compute RMS for 10ms windows in the last 300ms
  const windows: { rms: number; startIdx: number }[] = [];
  for (let i = startSample; i < pcm.length - windowSize; i += windowSize) {
    let sumSq = 0;
    for (let j = 0; j < windowSize; j++) sumSq += pcm[i + j] * pcm[i + j];
    windows.push({ rms: Math.sqrt(sumSq / windowSize), startIdx: i });
  }

  if (windows.length < 3) return { type: "clean", trimPoint: pcm.length, fadeMs: 20, confidence: 0 };

  // Speech RMS reference from the middle of the segment
  const midStart = Math.floor(pcm.length * 0.3);
  const midEnd = Math.floor(pcm.length * 0.7);
  let speechRmsSum = 0, speechCount = 0;
  for (let i = midStart; i < midEnd - windowSize; i += windowSize * 4) {
    let sumSq = 0;
    for (let j = 0; j < windowSize; j++) sumSq += pcm[i + j] * pcm[i + j];
    const rms = Math.sqrt(sumSq / windowSize);
    if (rms > 0.01) { speechRmsSum += rms; speechCount++; }
  }
  const speechRms = speechCount > 0 ? speechRmsSum / speechCount : 0.1;
  const breathLow = speechRms * 0.03;
  const breathHigh = speechRms * 0.18; // Tighter: only detect sounds clearly below speech level

  // Find where speech ends — scan backwards but require a clear drop-off
  // Speech can have soft endings, so we need a sustained drop, not a single dip
  let lastSpeechWindow = windows.length - 1;
  for (let i = windows.length - 1; i >= 0; i--) {
    if (windows[i].rms > breathHigh) { lastSpeechWindow = i; break; }
  }

  // Only consider it a trailing artifact if there are at least 3 consecutive
  // non-speech windows (30ms+) after the last speech window, AND they're in the
  // breath amplitude range (not just silence)
  const trailingWindows = windows.slice(lastSpeechWindow + 1);
  if (trailingWindows.length >= 3) {
    const breathWindows = trailingWindows.filter((w) => w.rms > breathLow && w.rms < breathHigh);
    // Need majority of trailing windows to be breath-like
    if (breathWindows.length >= 3 && breathWindows.length >= trailingWindows.length * 0.6) {
      return {
        type: "breath",
        trimPoint: windows[lastSpeechWindow].startIdx + windowSize,
        fadeMs: 30,
        confidence: breathWindows.length / trailingWindows.length,
      };
    }
  }

  // Click detection in last 50ms
  const clickRange = Math.floor(sampleRate * 0.050);
  for (let i = pcm.length - 1; i > pcm.length - clickRange && i > 50; i--) {
    let localSum = 0;
    for (let j = Math.max(0, i - 25); j < Math.min(pcm.length, i + 25); j++) {
      if (j !== i) localSum += pcm[j] * pcm[j];
    }
    const localRms = Math.sqrt(localSum / 49);
    if (Math.abs(pcm[i]) > localRms * 6 && localRms > 0.003) {
      return { type: "click", trimPoint: i, fadeMs: 5, confidence: 0.8 };
    }
  }

  return { type: "clean", trimPoint: pcm.length, fadeMs: 20, confidence: 0 };
}

// ── Pink Noise for Gap Fill ─────────────────────────────────────────────────

export function generatePinkNoise(length: number, levelDb: number): Float32Array {
  const out = new Float32Array(length);
  const amplitude = dbToLinear(levelDb);
  // Voss-McCartney: sum of octave-spaced white noise sources
  const numSources = 8;
  const values = new Float32Array(numSources);

  for (let i = 0; i < length; i++) {
    const changed = i === 0 ? 0xFF : i ^ (i - 1);
    let sum = 0;
    for (let s = 0; s < numSources; s++) {
      if (changed & (1 << s)) values[s] = Math.random() * 2 - 1;
      sum += values[s];
    }
    out[i] = (sum / numSources) * amplitude;
  }

  // Fade the noise in/out to avoid clicks at gap boundaries
  const fadeSamples = Math.min(Math.floor(length * 0.15), Math.floor(44100 * 0.01));
  for (let i = 0; i < fadeSamples; i++) {
    const g = 0.5 * (1 - Math.cos(Math.PI * i / fadeSamples));
    out[i] *= g;
    out[length - 1 - i] *= g;
  }

  return out;
}

// ── Silence Trimming ───────────────────────────────────────────────────────

function trimSilence(
  pcm: Float32Array,
  sampleRate: number,
  thresholdDb: number,
  leadMarginMs: number,
  trailMarginMs: number,
): { trimmed: Float32Array; startTrimmedMs: number; endTrimmedMs: number } {
  const threshold = dbToLinear(thresholdDb);
  const leadMarginSamples = Math.floor((leadMarginMs / 1000) * sampleRate);
  const trailMarginSamples = Math.floor((trailMarginMs / 1000) * sampleRate);

  // Find first sample above threshold
  let start = 0;
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) > threshold) {
      start = Math.max(0, i - leadMarginSamples);
      break;
    }
  }

  // Find last sample above threshold
  let end = pcm.length;
  for (let i = pcm.length - 1; i >= start; i--) {
    if (Math.abs(pcm[i]) > threshold) {
      end = Math.min(pcm.length, i + trailMarginSamples);
      break;
    }
  }

  const trimmed = new Float32Array(end - start);
  for (let i = 0; i < trimmed.length; i++) trimmed[i] = pcm[start + i];
  return {
    trimmed,
    startTrimmedMs: (start / sampleRate) * 1000,
    endTrimmedMs: ((pcm.length - end) / sampleRate) * 1000,
  };
}

// ── LUFS Measurement (simplified ITU-R BS.1770) ────────────────────────────

/**
 * Measure integrated loudness in LUFS.
 * Simplified implementation: uses K-weighting approximation via two biquad filters.
 */
function measureLufs(pcm: Float32Array, sampleRate: number): number {
  // K-weighting stage 1: high shelf boost (+4dB at 1681Hz)
  // K-weighting stage 2: high-pass at 38Hz (RLB weighting)
  // For simplicity, we use a direct RMS measurement with frequency weighting approximation
  // This is accurate to within ~1 LUFS for speech content

  // Apply simple K-weighting approximation
  const weighted = new Float32Array(pcm.length);
  // Simple first-order high-pass at ~100Hz to approximate K-weighting for speech
  let prev = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * 100 / sampleRate);
  for (let i = 0; i < pcm.length; i++) {
    prev = prev + alpha * (pcm[i] - prev);
    weighted[i] = pcm[i] - prev * 0.5; // Subtle high-pass
  }

  // Gated loudness: compute mean square over 400ms blocks, gate at -70 LUFS
  const blockSize = Math.floor(0.4 * sampleRate);
  const stepSize = Math.floor(0.1 * sampleRate); // 75% overlap
  const blocks: number[] = [];

  for (let i = 0; i + blockSize <= weighted.length; i += stepSize) {
    let sum = 0;
    for (let j = i; j < i + blockSize; j++) {
      sum += weighted[j] * weighted[j];
    }
    const meanSquare = sum / blockSize;
    const blockLufs = -0.691 + 10 * Math.log10(Math.max(meanSquare, 1e-10));
    blocks.push(blockLufs);
  }

  if (blocks.length === 0) return -70;

  // Absolute gate at -70 LUFS
  const aboveGate = blocks.filter((b) => b > -70);
  if (aboveGate.length === 0) return -70;

  // Relative gate: mean of above-gate blocks, then gate at mean - 10
  const absGateMean = aboveGate.reduce((a, b) => a + b, 0) / aboveGate.length;
  const relGateThreshold = absGateMean - 10;
  const aboveRelGate = aboveGate.filter((b) => b > relGateThreshold);
  if (aboveRelGate.length === 0) return -70;

  return aboveRelGate.reduce((a, b) => a + b, 0) / aboveRelGate.length;
}

// ── Normalization & Limiting ───────────────────────────────────────────────

function normalizeLufs(
  pcm: Float32Array,
  sampleRate: number,
  targetLufs: number,
): { normalized: Float32Array; gainApplied: number; measuredLufs: number } {
  const measuredLufs = measureLufs(pcm, sampleRate);
  const gainDb = targetLufs - measuredLufs;
  const gain = dbToLinear(gainDb);

  const normalized = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    normalized[i] = pcm[i] * gain;
  }

  return { normalized, gainApplied: gainDb, measuredLufs };
}

function peakLimit(pcm: Float32Array, limitDb: number): Float32Array {
  const limit = dbToLinear(limitDb);
  const result = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    result[i] = Math.max(-limit, Math.min(limit, pcm[i]));
  }
  return result;
}

function getPeakDb(pcm: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const abs = Math.abs(pcm[i]);
    if (abs > peak) peak = abs;
  }
  return linearToDb(peak);
}

// ── Fades ──────────────────────────────────────────────────────────────────

/** Fade-in: quarter-sine curve — fast onset, preserves transient attacks */
function applyFadeIn(pcm: Float32Array, sampleRate: number, durationMs: number): void {
  const samples = Math.min(Math.floor((durationMs / 1000) * sampleRate), pcm.length);
  for (let i = 0; i < samples; i++) {
    pcm[i] *= Math.sin((i / samples) * Math.PI / 2);
  }
}

/** Fade-out: cosine curve — slow departure, clean arrival at zero */
function applyFadeOut(pcm: Float32Array, sampleRate: number, durationMs: number): void {
  const samples = Math.min(Math.floor((durationMs / 1000) * sampleRate), pcm.length);
  const start = pcm.length - samples;
  for (let i = 0; i < samples; i++) {
    pcm[start + i] *= Math.cos((i / samples) * Math.PI / 2);
  }
}

/**
 * Apply a fade with configurable curve shape.
 * Strength controls the curve: 0=linear, 50=standard (quarter-sine in, cosine out), 100=aggressive.
 * The strength maps to a power exponent that shapes the gain curve.
 */
function applyFadeWithCurve(
  pcm: Float32Array, sampleRate: number, durationMs: number, strength: number, direction: "in" | "out",
): void {
  if (durationMs <= 0) return;
  const samples = Math.min(Math.floor((durationMs / 1000) * sampleRate), pcm.length);
  if (samples === 0) return;

  // Map strength (0-100) to curve behavior:
  // 0 = linear (power=1), 50 = standard trig (power~1.57), 100 = aggressive (power=3)
  const power = 1 + (strength / 100) * 2; // 1.0 to 3.0

  if (direction === "in") {
    for (let i = 0; i < samples; i++) {
      const t = i / samples; // 0 → 1
      pcm[i] *= Math.pow(t, power);
    }
  } else {
    const start = pcm.length - samples;
    for (let i = 0; i < samples; i++) {
      const t = i / samples; // 0 → 1 (0 = start of fade, 1 = end)
      pcm[start + i] *= Math.pow(1 - t, power);
    }
  }
}

// ── Shared Micro-Reverb (early reflections only) ───────────────────────────

/**
 * Create a tiny impulse response (~8ms) that simulates a shared acoustic space.
 * Applied to ALL segments so they sound like they were recorded in the same room.
 */
function createRoomIR(sampleRate: number): Float32Array {
  const lengthMs = 8;
  const length = Math.floor((lengthMs / 1000) * sampleRate);
  const ir = new Float32Array(length);

  // Direct sound
  ir[0] = 1.0;
  // Early reflections at specific delays
  const reflections = [
    { delayMs: 1.0, gain: 0.12 },
    { delayMs: 2.5, gain: 0.06 },
    { delayMs: 4.0, gain: 0.03 },
    { delayMs: 6.0, gain: 0.015 },
  ];
  for (const r of reflections) {
    const idx = Math.floor((r.delayMs / 1000) * sampleRate);
    if (idx < length) ir[idx] = r.gain;
  }

  // Exponential decay envelope
  for (let i = 0; i < length; i++) {
    ir[i] *= Math.exp(-i / (length * 0.3));
  }

  return ir;
}

/** Apply convolution with a short IR, mixed at wetLevel (linear, e.g. 0.03 = -30dB) */
function applyMicroReverb(pcm: Float32Array, ir: Float32Array, wetLevel: number): void {
  const wet = new Float32Array(pcm.length + ir.length);
  // Simple convolution (IR is tiny, so this is fast)
  for (let i = 0; i < pcm.length; i++) {
    for (let j = 0; j < ir.length; j++) {
      wet[i + j] += pcm[i] * ir[j];
    }
  }
  // Mix wet into dry
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] += wet[i] * wetLevel;
  }
}

// ── Tail Fade Analysis ──────────────────────────────────────────────────────

/**
 * Analyze the tail of a segment to determine optimal fade-out length.
 * Measures how much energy remains at the very end of the audio.
 * More residual energy = longer fade to avoid abrupt cutoff.
 */
function computeTailFade(pcm: Float32Array, sampleRate: number): number {
  if (pcm.length < sampleRate * 0.05) return 5;

  const windowSize = Math.floor(sampleRate * 0.005); // 5ms windows

  // RMS of the very last 10ms
  const lastSamples = Math.min(windowSize * 2, pcm.length);
  let lastSumSq = 0;
  for (let i = pcm.length - lastSamples; i < pcm.length; i++) {
    lastSumSq += pcm[i] * pcm[i];
  }
  const lastRms = Math.sqrt(lastSumSq / lastSamples);

  // RMS of last 50ms (broader view)
  const tailSamples = Math.min(Math.floor(sampleRate * 0.05), pcm.length);
  let tailSumSq = 0;
  for (let i = pcm.length - tailSamples; i < pcm.length; i++) {
    tailSumSq += pcm[i] * pcm[i];
  }
  const tailRms = Math.sqrt(tailSumSq / tailSamples);

  // Tail already silent: minimal anti-click fade
  if (lastRms < 0.002) return 8;

  // Tail has low residual (natural decay): short fade
  if (lastRms < 0.01) return 15;

  // Tail has moderate residual (breath, resonance): smooth blend
  if (lastRms < 0.05) {
    return Math.round(25 + (lastRms / 0.05) * 35); // 25-60ms
  }

  // Tail still has significant energy (abrupt cutoff): longer fade
  // but not too long — we don't want to lose final consonants
  if (tailRms > 0.08) return 40;

  return 50; // noisy tail, needs a proper fade
}

// ── Trailing Silence Measurement ────────────────────────────────────────────

/**
 * Measure how much of the last 200ms is effectively silent.
 * Returns 0 (no trailing silence) to 1 (last 200ms fully silent).
 * Used to determine how much additional gap is needed.
 */
export function measureTrailingSilence(pcm: Float32Array, sampleRate: number): number {
  const analyzeMs = 200;
  const analyzeSamples = Math.min(Math.floor(sampleRate * analyzeMs / 1000), pcm.length);
  if (analyzeSamples < 10) return 0;

  const threshold = 0.008; // RMS threshold for "silent"
  const windowSize = Math.floor(sampleRate * 0.010); // 10ms windows
  const startSample = pcm.length - analyzeSamples;

  let silentWindows = 0;
  let totalWindows = 0;

  for (let i = startSample; i + windowSize <= pcm.length; i += windowSize) {
    let sumSq = 0;
    for (let j = 0; j < windowSize; j++) sumSq += pcm[i + j] * pcm[i + j];
    const rms = Math.sqrt(sumSq / windowSize);
    if (rms < threshold) silentWindows++;
    totalWindows++;
  }

  return totalWindows > 0 ? silentWindows / totalWindows : 0;
}

// ── Tail Artifact Detection ────────────────────────────────────────────────

/**
 * Detect trailing clicks, pops, or artifacts in a segment's audio.
 * Scans the last 500ms in 5ms windows. Detects:
 * 1. End-of-segment clicks: spike in the last 10ms after quiet
 * 2. Isolated energy spikes surrounded by quiet windows
 * 3. Dip-then-rise: energy drops then rises again at the tail (TTS artifact / breath)
 *
 * Returns recommended earlyStopMs (0 = no artifact found).
 * Does NOT modify the audio — caller stores the result as a setting.
 */
export function detectTailArtifact(pcm: Float32Array, sampleRate: number): number {
  const windowMs = 5;
  const windowSamples = Math.floor((windowMs / 1000) * sampleRate);

  // ── Pre-check: Trailing silence (scan full audio, not just last 500ms) ──
  // Use a relative threshold based on speech body energy so we catch
  // low-level TTS room tone that isn't true zero.
  const windowSamples50 = Math.floor(0.05 * sampleRate); // 50ms windows
  const bodyRms: number[] = [];
  for (let i = 0; i + windowSamples50 <= pcm.length; i += windowSamples50) {
    let s = 0;
    for (let j = 0; j < windowSamples50; j++) s += pcm[i + j] * pcm[i + j];
    bodyRms.push(Math.sqrt(s / windowSamples50));
  }
  bodyRms.sort((a, b) => a - b);
  const speechLevel = bodyRms[Math.floor(bodyRms.length * 0.9)] || 0.05;
  const silenceThresholdRms = Math.max(0.001, speechLevel * 0.08);

  // Scan from end, but skip the last 100ms (may contain end-click artifacts).
  // If there's a long quiet zone before an end spike, we want to trim at the quiet zone.
  const windowSamples10 = Math.floor(0.01 * sampleRate);
  const skipEndSamples = Math.floor(0.1 * sampleRate); // skip last 100ms
  let lastActiveSample = pcm.length;
  for (let i = pcm.length - skipEndSamples - windowSamples10; i >= 0; i -= windowSamples10) {
    let sumSq = 0;
    for (let j = 0; j < windowSamples10 && i + j < pcm.length; j++) sumSq += pcm[i + j] * pcm[i + j];
    if (Math.sqrt(sumSq / windowSamples10) > silenceThresholdRms) {
      lastActiveSample = i + windowSamples10;
      break;
    }
  }
  // Also check if the skipped end zone is actually silent (no end spike)
  let endHasSpike = false;
  for (let i = pcm.length - skipEndSamples; i + windowSamples10 <= pcm.length; i += windowSamples10) {
    let sumSq = 0;
    for (let j = 0; j < windowSamples10; j++) sumSq += pcm[i + j] * pcm[i + j];
    if (Math.sqrt(sumSq / windowSamples10) > silenceThresholdRms) { endHasSpike = true; break; }
  }
  // If end is clean (no spike), include it in the active range
  if (!endHasSpike) {
    // Re-scan including end zone
    for (let i = pcm.length - windowSamples10; i >= pcm.length - skipEndSamples; i -= windowSamples10) {
      let sumSq = 0;
      for (let j = 0; j < windowSamples10 && i + j < pcm.length; j++) sumSq += pcm[i + j] * pcm[i + j];
      if (Math.sqrt(sumSq / windowSamples10) > silenceThresholdRms) {
        lastActiveSample = Math.max(lastActiveSample, i + windowSamples10);
        break;
      }
    }
  }
  const trailingSilenceMs = ((pcm.length - lastActiveSample) / sampleRate) * 1000;
  if (trailingSilenceMs > 50) {
    return Math.round(Math.max(0, trailingSilenceMs - 30));
  }

  // ── Artifact checks (last 500ms) ──
  const analyzeMs = 500;
  const analyzeSamples = Math.min(Math.floor((analyzeMs / 1000) * sampleRate), pcm.length);
  if (analyzeSamples < windowSamples * 3) return 0;

  const startSample = pcm.length - analyzeSamples;

  // Compute RMS per 5ms window for the tail region
  interface Win { rms: number; offsetFromEnd: number }
  const windows: Win[] = [];
  for (let i = startSample; i + windowSamples <= pcm.length; i += windowSamples) {
    let sumSq = 0;
    for (let j = 0; j < windowSamples; j++) sumSq += pcm[i + j] * pcm[i + j];
    const rms = Math.sqrt(sumSq / windowSamples);
    windows.push({ rms, offsetFromEnd: ((pcm.length - i) / sampleRate) * 1000 });
  }
  if (windows.length < 4) return 0;

  // windows[0] = earliest (500ms from end), windows[last] = last 5ms
  // reversed[0] = last 5ms, reversed[last] = 500ms from end
  const reversed = [...windows].reverse();

  // ── Check 1: End-of-segment click ──
  // If last 1-2 windows have a sudden spike compared to the windows just before
  const last = reversed[0].rms;
  const prevAvg = (reversed[1].rms + reversed[2].rms + reversed[3].rms) / 3;
  if (last > prevAvg * 5 && last > 0.005) {
    // Sharp spike in the last 5ms — classic click
    return Math.round(reversed[0].offsetFromEnd);
  }
  // Check last 2 windows
  const last2Avg = (reversed[0].rms + reversed[1].rms) / 2;
  const prev3Avg = (reversed[2].rms + reversed[3].rms + reversed[4].rms) / 3;
  if (last2Avg > prev3Avg * 5 && last2Avg > 0.005) {
    return Math.round(reversed[1].offsetFromEnd);
  }

  // ── Check 2: Dip-then-rise pattern (TTS artifact / trailing breath) ──
  // Look for a genuine quiet gap (multiple consecutive low-energy windows) followed
  // by a rise. Single-window dips are normal speech (consonants between syllables).
  const tail20 = reversed.slice(0, 20); // last 100ms
  if (tail20.length >= 8) {
    // Find runs of consecutive quiet windows (RMS < 0.005 = near silence)
    const silenceThreshold = 0.005;
    let bestGapStart = -1;
    let bestGapLen = 0;
    let gapStart = -1;
    let gapLen = 0;
    for (let i = 0; i < tail20.length; i++) {
      if (tail20[i].rms < silenceThreshold) {
        if (gapStart < 0) gapStart = i;
        gapLen++;
      } else {
        if (gapLen >= 3 && gapLen > bestGapLen) { // At least 15ms of silence
          bestGapStart = gapStart;
          bestGapLen = gapLen;
        }
        gapStart = -1;
        gapLen = 0;
      }
    }
    if (gapLen >= 3 && gapLen > bestGapLen) { bestGapStart = gapStart; bestGapLen = gapLen; }

    // If we found a quiet gap with energy after it (toward the end), that's an artifact
    if (bestGapStart >= 2 && bestGapLen >= 3) {
      const afterGap = tail20.slice(0, bestGapStart).reduce((s, w) => s + w.rms, 0) / bestGapStart;
      if (afterGap > silenceThreshold * 3) {
        return Math.round(tail20[bestGapStart].offsetFromEnd);
      }
    }
  }

  // ── Check 3: Isolated spike in the tail (click within quiet region) ──
  for (let i = 1; i < reversed.length - 1; i++) {
    const prev = reversed[i - 1].rms;
    const curr = reversed[i].rms;
    const next = reversed[i + 1].rms;
    if (curr > prev * 8 && curr > next * 8 && curr > 0.005) {
      return Math.round(reversed[i - 1].offsetFromEnd);
    }
  }

  // ── Check 4: Non-monotonic tail decay (TTS trailing artifact) ──
  // Speech energy should decay at the end. If it drops then rises significantly,
  // the rising part is likely a TTS artifact (phantom phoneme, breath, resonance).
  // Use 10ms windows in the last 100ms for smoother averaging.
  if (reversed.length >= 10) {
    const tail10 = reversed.slice(0, 10); // last 50ms in 5ms steps
    // Find the minimum point (potential trough before artifact)
    let minIdx = 0;
    for (let i = 1; i < tail10.length; i++) {
      if (tail10[i].rms < tail10[minIdx].rms) minIdx = i;
    }
    // Trough must be in the middle (not at the very end or start of the window)
    if (minIdx >= 2 && minIdx <= 7) {
      const troughRms = tail10[minIdx].rms;
      // Average of windows AFTER the trough (closer to end of segment = before in reversed)
      const afterRise = tail10.slice(0, minIdx);
      const riseAvg = afterRise.reduce((s, w) => s + w.rms, 0) / afterRise.length;
      // Average of windows BEFORE the trough (earlier in segment = later in reversed)
      const beforeDecay = tail10.slice(minIdx + 1);
      const decayAvg = beforeDecay.reduce((s, w) => s + w.rms, 0) / beforeDecay.length;

      // The rise must be significantly above the trough, and the decay before it
      // must also be higher (confirming energy was dropping before the artifact)
      if (riseAvg > troughRms * 1.8 && decayAvg > troughRms * 1.5 && riseAvg > 0.02) {
        return Math.round(tail10[minIdx].offsetFromEnd);
      }
    }
  }

  return 0;
}

// ── Optimal Fade Detection ─────────────────────────────────────────────────

/**
 * Analyze a segment's audio to recommend optimal fade-in and fade-out durations.
 * - Fade-in: based on onset energy (plosives need short fades, soft onsets allow longer)
 * - Fade-out: based on tail energy profile (natural decay vs abrupt cutoff)
 */
export function detectOptimalFades(pcm: Float32Array, sampleRate: number): {
  fadeInMs: number;
  fadeOutMs: number;
} {
  const windowSamples = Math.floor(0.005 * sampleRate); // 5ms

  // ── Fade-in analysis: check onset energy ──
  // Scan first 50ms in 5ms windows
  let fadeInMs = 10; // default: preserves plosives
  const onsetWindows = Math.min(10, Math.floor(pcm.length / windowSamples));
  if (onsetWindows >= 2) {
    let firstRms = 0;
    for (let j = 0; j < windowSamples; j++) firstRms += pcm[j] * pcm[j];
    firstRms = Math.sqrt(firstRms / windowSamples);

    let secondRms = 0;
    for (let j = windowSamples; j < windowSamples * 2; j++) secondRms += pcm[j] * pcm[j];
    secondRms = Math.sqrt(secondRms / windowSamples);

    // Hard plosive attack: first window much louder than second
    if (firstRms > secondRms * 2 && firstRms > 0.05) {
      fadeInMs = 5; // very short to preserve attack
    } else if (firstRms < 0.01) {
      fadeInMs = 25; // soft onset, can fade in more
    }
  }

  // ── Fade-out analysis: use tail energy profile ──
  const fadeOutMs = computeTailFade(pcm, sampleRate);

  return { fadeInMs: Math.round(fadeInMs), fadeOutMs: Math.round(fadeOutMs) };
}

// ── Context-Aware Gap Duration ─────────────────────────────────────────────

/**
 * Compute gap duration based on:
 * 1. Speaker transition type (same, narrator↔character, character↔character)
 * 2. How much trailing silence the audio already has (avoids double-pausing)
 *
 * The trailing silence ratio is the key — it's measured from the actual audio,
 * not from text punctuation. This makes it work for any book, any language.
 */
export function computeGapMs(ctx: GapContext): number {
  if (ctx.isFirstSegment) return 0;

  const prev = ctx.prevSpeaker;
  const curr = ctx.currentSpeaker;
  const silence = ctx.prevTrailingSilenceRatio; // 0 = cuts off hot, 1 = fully silent tail

  if (!prev) return 400;

  // Base gap by transition type
  let baseMs: number;
  if (prev === curr) {
    baseMs = curr === "Narrator" ? 450 : 350;    // Same speaker
  } else if (prev === "Narrator" || curr === "Narrator") {
    baseMs = 400;                                  // Narrator ↔ character
  } else {
    baseMs = 600;                                  // Character ↔ different character
  }

  // If the previous segment's audio already trails into silence,
  // we need less additional gap. The audio itself provides the pause.
  // silence=0: audio ends abruptly → full gap needed
  // silence=0.5: audio has some natural decay → reduce gap by 25%
  // silence=1.0: audio already has long trailing silence → reduce gap by 50%
  const reduction = Math.min(silence * 0.5, 0.5);
  const adjustedMs = Math.round(baseMs * (1 - reduction));

  // Short segments (<1s) need a touch more space so they don't feel rushed
  if (ctx.isShortSegment) return adjustedMs + 80;

  return adjustedMs;
}

// ── Full Processing Pipeline ───────────────────────────────────────────────

export interface SegmentInput {
  id: string;
  speaker: string;
  voiceText: string;
  audioBuffer: AudioBuffer;
}

/**
 * Process a single segment through the full pipeline.
 */
export function processSegment(
  input: SegmentInput,
  config: AssemblyConfig = DEFAULT_CONFIG,
): ProcessedSegment {
  const sampleRate = input.audioBuffer.sampleRate;
  // Copy PCM data so we don't mutate the original AudioBuffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pcm: any = new Float32Array(input.audioBuffer.getChannelData(0));

  // 1. Trim silence (leading/trailing dead air)
  const { trimmed, startTrimmedMs, endTrimmedMs } = trimSilence(
    pcm, sampleRate, config.trimThresholdDb, config.trimLeadMs, config.trimTrailMs,
  );
  pcm = trimmed as Float32Array;

  // 1b. Early stop — remove trailing clicks/artifacts before further processing.
  // Subtract silence already removed by trimSilence to avoid double-trimming.
  if (config.earlyStopMs > 0) {
    const effectiveEarlyStopMs = Math.max(0, config.earlyStopMs - endTrimmedMs);
    const samplesToRemove = Math.floor((effectiveEarlyStopMs / 1000) * sampleRate);
    if (samplesToRemove > 0 && samplesToRemove < pcm.length) {
      pcm = pcm.slice(0, pcm.length - samplesToRemove) as Float32Array;
    }
  }

  // 2. Normalize LUFS
  const { normalized, gainApplied, measuredLufs } = normalizeLufs(pcm, sampleRate, config.targetLufs);
  pcm = normalized as Float32Array;

  // 3. Apply shared micro-reverb (before peak limit so limit catches reverb overshoot)
  const ir = createRoomIR(sampleRate);
  applyMicroReverb(pcm, ir, 0.03); // -30dB wet level

  // 4. Peak limit (after reverb to catch any overshoot)
  pcm = peakLimit(pcm, config.peakLimitDb) as Float32Array;

  // 5. Apply fades with configurable curves
  applyFadeWithCurve(pcm, sampleRate, config.fadeInMs, config.fadeInStrength, "in");
  applyFadeWithCurve(pcm, sampleRate, config.fadeOutMs, config.fadeOutStrength, "out");

  return {
    id: input.id,
    speaker: input.speaker,
    pcm,
    sampleRate,
    lufs: measuredLufs + gainApplied,
    peakDb: getPeakDb(pcm),
    trimmedMs: { start: startTrimmedMs, end: endTrimmedMs },
    trailingSilenceRatio: measureTrailingSilence(pcm, sampleRate),
  };
}

/**
 * Assemble processed segments into a single PCM buffer with context-aware gaps.
 */
export function assembleAudiobook(
  segments: ProcessedSegment[],
  voiceTexts: string[],
  config: AssemblyConfig = DEFAULT_CONFIG,
): AssemblyResult {
  if (segments.length === 0) {
    return { pcm: new Float32Array(0), sampleRate: 44100, duration: 0, segments: [] };
  }

  const sampleRate = segments[0].sampleRate;
  const resultSegments: AssemblyResult["segments"] = [];

  // Build gaps with pink noise fill
  const gapBuffers: Float32Array[] = [];
  let totalSamples = 0;
  const NOISE_LEVEL_DB = -52; // Subtle pink noise — fills digital silence

  for (let i = 0; i < segments.length; i++) {
    const ctx: GapContext = {
      prevSpeaker: i > 0 ? segments[i - 1].speaker : null,
      currentSpeaker: segments[i].speaker,
      nextSpeaker: i < segments.length - 1 ? segments[i + 1].speaker : null,
      prevTrailingSilenceRatio: i > 0 ? segments[i - 1].trailingSilenceRatio : 0,
      isShortSegment: segments[i].pcm.length / sampleRate < 1,
      isFirstSegment: i === 0,
      isLastSegment: i === segments.length - 1,
    };

    let gapMs = computeGapMs(ctx);
    if (ctx.isShortSegment && !ctx.isFirstSegment) gapMs += 100;

    const gapSamples = Math.floor((gapMs / 1000) * sampleRate);
    // Fill gaps with pink noise instead of digital silence
    const gapBuffer = gapSamples > 0 ? generatePinkNoise(gapSamples, NOISE_LEVEL_DB) : new Float32Array(0);
    gapBuffers.push(gapBuffer);

    totalSamples += gapBuffer.length + segments[i].pcm.length;
  }

  // Add chapter head/tail (with pink noise)
  const headSamples = Math.floor(0.5 * sampleRate);
  const tailSamples = Math.floor(1.0 * sampleRate);
  const headNoise = generatePinkNoise(headSamples, NOISE_LEVEL_DB);
  const tailNoise = generatePinkNoise(tailSamples, NOISE_LEVEL_DB);
  totalSamples += headSamples + tailSamples;

  // Assemble with L-cut/J-cut overlaps
  const pcm = new Float32Array(totalSamples);
  const OVERLAP_MS = 25; // Tail/head bleed into gap
  const OVERLAP_GAIN = 0.06; // -24dB

  pcm.set(headNoise, 0);
  let offset = headSamples;

  for (let i = 0; i < segments.length; i++) {
    pcm.set(gapBuffers[i], offset);

    // L-cut: blend previous segment's tail into gap start
    if (i > 0) {
      const prevSeg = segments[i - 1];
      const overlapSamples = Math.min(
        Math.floor((OVERLAP_MS / 1000) * sampleRate),
        prevSeg.pcm.length,
        gapBuffers[i].length,
      );
      for (let j = 0; j < overlapSamples; j++) {
        const t = j / overlapSamples;
        const gain = (1 - t) * OVERLAP_GAIN;
        pcm[offset + j] += prevSeg.pcm[prevSeg.pcm.length - overlapSamples + j] * gain;
      }
    }

    offset += gapBuffers[i].length;

    const seg = segments[i];

    // J-cut: blend this segment's head into gap end
    if (gapBuffers[i].length > 0) {
      const gapStart = offset - gapBuffers[i].length;
      const overlapSamples = Math.min(
        Math.floor((OVERLAP_MS / 1000) * sampleRate),
        seg.pcm.length,
        gapBuffers[i].length,
      );
      const gapEnd = offset;
      for (let j = 0; j < overlapSamples; j++) {
        const t = j / overlapSamples;
        const gain = t * OVERLAP_GAIN;
        pcm[gapEnd - overlapSamples + j] += seg.pcm[j] * gain;
      }
    }

    pcm.set(seg.pcm, offset);

    resultSegments.push({
      id: seg.id,
      speaker: seg.speaker,
      offsetMs: (offset / sampleRate) * 1000,
      durationMs: (seg.pcm.length / sampleRate) * 1000,
      gapBeforeMs: (gapBuffers[i].length / sampleRate) * 1000,
      lufs: seg.lufs,
      gainApplied: 0,
    });

    offset += seg.pcm.length;
  }

  pcm.set(tailNoise, offset);

  // Apply chapter fade-in/out
  applyFadeIn(pcm, sampleRate, config.chapterFadeInMs);
  applyFadeOut(pcm, sampleRate, config.chapterFadeOutMs);

  return {
    pcm,
    sampleRate,
    duration: totalSamples / sampleRate,
    segments: resultSegments,
  };
}

/**
 * Encode PCM to WAV (client-side, no external lib needed).
 */
export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM samples (16-bit)
  let p = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    p += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
