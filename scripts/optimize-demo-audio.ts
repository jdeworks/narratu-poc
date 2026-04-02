/**
 * Pre-compute audio optimizations for demo segments.
 * Runs tail artifact detection on all segment audio files and writes
 * results to manifest.json as audioOptimizations.
 *
 * Usage: npx tsx scripts/optimize-demo-audio.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Minimal AudioContext polyfill for Node — uses ffmpeg to decode
import { execSync } from "child_process";

function decodePcm(filePath: string): { pcm: Float32Array; sampleRate: number } {
  const raw = execSync(
    `ffmpeg -i "${filePath}" -f f32le -acodec pcm_f32le -ac 1 -ar 44100 - 2>/dev/null`,
    { maxBuffer: 50 * 1024 * 1024 },
  );
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  return { pcm, sampleRate: 44100 };
}

/** Mirror of detectTailArtifact from src/engine/audio-processor.ts */
function detectTailArtifact(pcm: Float32Array, sampleRate: number): number {
  const windowSamples = Math.floor(0.005 * sampleRate); // 5ms

  // Pre-check: trailing silence using relative threshold
  // Skip last 100ms to avoid end-click spikes masking long silence before them
  const ws50 = Math.floor(0.05 * sampleRate);
  const bodyRms: number[] = [];
  for (let i = 0; i + ws50 <= pcm.length; i += ws50) {
    let s = 0; for (let j = 0; j < ws50; j++) s += pcm[i+j]*pcm[i+j];
    bodyRms.push(Math.sqrt(s / ws50));
  }
  bodyRms.sort((a, b) => a - b);
  const speechLevel = bodyRms[Math.floor(bodyRms.length * 0.9)] || 0.05;
  const silThresh = Math.max(0.001, speechLevel * 0.08);

  const ws10 = Math.floor(0.01 * sampleRate);
  const skipEnd = Math.floor(0.1 * sampleRate);
  let lastActive = pcm.length;
  // Scan from end minus 100ms (skip potential end spike)
  for (let i = pcm.length - skipEnd - ws10; i >= 0; i -= ws10) {
    let s = 0; for (let j = 0; j < ws10 && i+j < pcm.length; j++) s += pcm[i+j]*pcm[i+j];
    if (Math.sqrt(s / ws10) > silThresh) { lastActive = i + ws10; break; }
  }
  // Check if end zone is clean (no spike) — if so, include it
  let endSpike = false;
  for (let i = pcm.length - skipEnd; i + ws10 <= pcm.length; i += ws10) {
    let s = 0; for (let j = 0; j < ws10; j++) s += pcm[i+j]*pcm[i+j];
    if (Math.sqrt(s / ws10) > silThresh) { endSpike = true; break; }
  }
  if (!endSpike) {
    for (let i = pcm.length - ws10; i >= pcm.length - skipEnd; i -= ws10) {
      let s = 0; for (let j = 0; j < ws10 && i+j < pcm.length; j++) s += pcm[i+j]*pcm[i+j];
      if (Math.sqrt(s / ws10) > silThresh) { lastActive = Math.max(lastActive, i + ws10); break; }
    }
  }
  const silenceMs = ((pcm.length - lastActive) / sampleRate) * 1000;
  if (silenceMs > 50) return Math.round(Math.max(0, silenceMs - 30));

  const analyzeSamples = Math.min(Math.floor(0.5 * sampleRate), pcm.length);
  if (analyzeSamples < windowSamples * 4) return 0;

  const startSample = pcm.length - analyzeSamples;
  interface Win { rms: number; offsetFromEnd: number }
  const windows: Win[] = [];
  for (let i = startSample; i + windowSamples <= pcm.length; i += windowSamples) {
    let sumSq = 0;
    for (let j = 0; j < windowSamples; j++) sumSq += pcm[i + j] * pcm[i + j];
    windows.push({ rms: Math.sqrt(sumSq / windowSamples), offsetFromEnd: ((pcm.length - i) / sampleRate) * 1000 });
  }
  if (windows.length < 4) return 0;
  const reversed = [...windows].reverse();

  // Check 1: End click — last 1-2 windows spike vs prior 3
  const last = reversed[0].rms;
  const prevAvg = (reversed[1].rms + reversed[2].rms + reversed[3].rms) / 3;
  if (last > prevAvg * 5 && last > 0.005) return Math.round(reversed[0].offsetFromEnd);
  const last2Avg = (reversed[0].rms + reversed[1].rms) / 2;
  const prev3Avg = (reversed[2].rms + reversed[3].rms + (reversed[4]?.rms ?? reversed[3].rms)) / 3;
  if (last2Avg > prev3Avg * 5 && last2Avg > 0.005) return Math.round(reversed[1].offsetFromEnd);

  // Check 2: Dip-then-rise in last 100ms
  const tail20 = reversed.slice(0, 20);
  if (tail20.length >= 8) {
    let minIdx = 0;
    for (let i = 1; i < tail20.length; i++) { if (tail20[i].rms < tail20[minIdx].rms) minIdx = i; }
    // Find runs of consecutive quiet windows (near silence)
    const silenceThreshold = 0.005;
    let bestGapStart = -1, bestGapLen = 0, gapStart = -1, gapLen = 0;
    for (let i = 0; i < tail20.length; i++) {
      if (tail20[i].rms < silenceThreshold) {
        if (gapStart < 0) gapStart = i;
        gapLen++;
      } else {
        if (gapLen >= 3 && gapLen > bestGapLen) { bestGapStart = gapStart; bestGapLen = gapLen; }
        gapStart = -1; gapLen = 0;
      }
    }
    if (gapLen >= 3 && gapLen > bestGapLen) { bestGapStart = gapStart; bestGapLen = gapLen; }
    if (bestGapStart >= 2 && bestGapLen >= 3) {
      const afterGap = tail20.slice(0, bestGapStart).reduce((s, w) => s + w.rms, 0) / bestGapStart;
      if (afterGap > silenceThreshold * 3) return Math.round(tail20[bestGapStart].offsetFromEnd);
    }
  }

  // Check 3: Isolated spike
  for (let i = 1; i < reversed.length - 1; i++) {
    const curr = reversed[i].rms;
    if (curr > reversed[i - 1].rms * 8 && curr > reversed[i + 1].rms * 8 && curr > 0.005) {
      return Math.round(reversed[i - 1].offsetFromEnd);
    }
  }

  // Check 4: Non-monotonic tail decay (TTS trailing artifact)
  if (reversed.length >= 10) {
    const tail10 = reversed.slice(0, 10);
    let minIdx = 0;
    for (let i = 1; i < tail10.length; i++) { if (tail10[i].rms < tail10[minIdx].rms) minIdx = i; }
    if (minIdx >= 2 && minIdx <= 7) {
      const troughRms = tail10[minIdx].rms;
      const riseAvg = tail10.slice(0, minIdx).reduce((s, w) => s + w.rms, 0) / minIdx;
      const decayAvg = tail10.slice(minIdx + 1).reduce((s, w) => s + w.rms, 0) / (tail10.length - minIdx - 1);
      if (riseAvg > troughRms * 1.8 && decayAvg > troughRms * 1.5 && riseAvg > 0.02) {
        return Math.round(tail10[minIdx].offsetFromEnd);
      }
    }
  }

  return 0;
}

/** Detect optimal fade-in/out from audio content */
function detectFades(pcm: Float32Array, sampleRate: number): { fadeInMs: number; fadeOutMs: number } {
  const ws = Math.floor(0.005 * sampleRate);

  // Fade-in: check onset
  let fadeInMs = 10;
  if (pcm.length > ws * 2) {
    let r1 = 0, r2 = 0;
    for (let j = 0; j < ws; j++) r1 += pcm[j] * pcm[j];
    for (let j = ws; j < ws * 2; j++) r2 += pcm[j] * pcm[j];
    r1 = Math.sqrt(r1 / ws); r2 = Math.sqrt(r2 / ws);
    if (r1 > r2 * 2 && r1 > 0.05) fadeInMs = 5;
    else if (r1 < 0.01) fadeInMs = 25;
  }

  // Fade-out: tail energy analysis
  let fadeOutMs = 50;
  if (pcm.length > sampleRate * 0.05) {
    const lastSamples = Math.min(ws * 2, pcm.length);
    let lastSumSq = 0;
    for (let i = pcm.length - lastSamples; i < pcm.length; i++) lastSumSq += pcm[i] * pcm[i];
    const lastRms = Math.sqrt(lastSumSq / lastSamples);

    if (lastRms < 0.002) fadeOutMs = 8;
    else if (lastRms < 0.01) fadeOutMs = 15;
    else if (lastRms < 0.05) fadeOutMs = Math.round(25 + (lastRms / 0.05) * 35);
    else if (lastRms > 0.08) fadeOutMs = 40;
  }

  return { fadeInMs, fadeOutMs };
}

// ── Main ──

const manifestPath = join(import.meta.dirname, "../public/demo/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

const audioSegments: { segmentId: string; file: string }[] = manifest.audioSegments ?? [];
const optimizations: Record<string, Record<string, number>> = {};
let detected = 0;

for (const seg of audioSegments) {
  const filePath = join(import.meta.dirname, "../public/demo", seg.file);
  try {
    const { pcm, sampleRate } = decodePcm(filePath);
    const opts: Record<string, number> = {};

    // Detect trailing artifacts
    const earlyStopMs = detectTailArtifact(pcm, sampleRate);
    if (earlyStopMs > 0) opts.earlyStopMs = earlyStopMs;

    // Detect optimal fades
    const fades = detectFades(pcm, sampleRate);
    if (fades.fadeInMs !== 10) opts.fadeInMs = fades.fadeInMs;
    if (fades.fadeOutMs !== 50) opts.fadeOutMs = fades.fadeOutMs;

    if (Object.keys(opts).length > 0) {
      optimizations[seg.segmentId] = opts;
      detected++;
      const parts = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(", ");
      console.log(`  ${seg.segmentId}: ${parts}`);
    }
  } catch (err) {
    console.error(`  ${seg.segmentId}: FAILED`, (err as Error).message);
  }
}

manifest.audioOptimizations = optimizations;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nDone: ${detected}/${audioSegments.length} segments optimized`);
