/**
 * Global audio player - ensures only one audio plays at a time.
 * Supports fade in/out, padding, de-esser, and brightness via Web Audio API.
 */

let current: HTMLAudioElement | null = null;
let onStopCallback: (() => void) | null = null;
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let deEsserFilter: BiquadFilterNode | null = null;
let highShelfFilter: BiquadFilterNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let fadeTimer: number | null = null;

// Persisted settings
let currentSpeed = 1.0;
let currentDeEsser = 0;
let currentBrightness = 0;

// Global playing ID for cross-component coordination
let currentPlayingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export interface SegmentAudioSettings {
  fadeIn: number;   // seconds
  fadeOut: number;  // seconds
  padStart: number; // seconds
  padEnd: number;   // seconds
}

export function onPlayingChange(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const fn of listeners) fn(currentPlayingId);
}

export function getPlayingId(): string | null {
  return currentPlayingId;
}

function cleanup() {
  if (fadeTimer !== null) { cancelAnimationFrame(fadeTimer); fadeTimer = null; }
  try { sourceNode?.disconnect(); } catch { /* ok */ }
  try { gainNode?.disconnect(); } catch { /* ok */ }
  try { deEsserFilter?.disconnect(); } catch { /* ok */ }
  try { highShelfFilter?.disconnect(); } catch { /* ok */ }
  try { audioCtx?.close(); } catch { /* ok */ }
  current = null;
  onStopCallback = null;
  audioCtx = null;
  gainNode = null;
  deEsserFilter = null;
  highShelfFilter = null;
  sourceNode = null;
}

/**
 * Apply fade in/out as real-time gain automation.
 * Called every frame while audio is playing.
 */
function applyFadeGain(audio: HTMLAudioElement, settings: SegmentAudioSettings) {
  if (!gainNode || !audio.duration) return;

  const t = audio.currentTime;
  const dur = audio.duration;
  let gain = 1.0;

  // Fade in
  if (settings.fadeIn > 0 && t < settings.fadeIn) {
    gain = t / settings.fadeIn;
  }

  // Fade out
  if (settings.fadeOut > 0 && t > dur - settings.fadeOut) {
    const fadeOutGain = (dur - t) / settings.fadeOut;
    gain = Math.min(gain, fadeOutGain);
  }

  gainNode.gain.value = Math.max(0, Math.min(1, gain));

  if (!audio.paused) {
    fadeTimer = requestAnimationFrame(() => applyFadeGain(audio, settings));
  }
}

export function playAudio(
  url: string,
  onEnd?: () => void,
  id?: string,
  settings?: SegmentAudioSettings,
): HTMLAudioElement {
  stopAudio();

  const hasPadStart = settings && settings.padStart > 0;
  const audio = new Audio(url);
  if (!url.startsWith("blob:")) {
    audio.crossOrigin = "anonymous";
  }
  audio.playbackRate = currentSpeed;
  current = audio;
  onStopCallback = onEnd ?? null;
  currentPlayingId = id ?? url;
  notifyListeners();

  audio.onended = () => {
    // Handle pad end: keep "playing" state for padEnd duration
    if (settings && settings.padEnd > 0) {
      setTimeout(() => {
        currentPlayingId = null;
        cleanup();
        notifyListeners();
        onEnd?.();
      }, settings.padEnd * 1000);
    } else {
      currentPlayingId = null;
      cleanup();
      notifyListeners();
      onEnd?.();
    }
  };

  audio.onerror = () => {
    currentPlayingId = null;
    cleanup();
    notifyListeners();
    onEnd?.();
  };

  // Set up Web Audio chain: source -> gain -> deEsser -> brightness -> output
  try {
    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaElementSource(audio);

    gainNode = audioCtx.createGain();
    gainNode.gain.value = (settings && settings.fadeIn > 0) ? 0 : 1;

    deEsserFilter = audioCtx.createBiquadFilter();
    deEsserFilter.type = "peaking";
    deEsserFilter.frequency.value = 6000;
    deEsserFilter.Q.value = 2;
    deEsserFilter.gain.value = -(currentDeEsser / 100) * 18;

    highShelfFilter = audioCtx.createBiquadFilter();
    highShelfFilter.type = "highshelf";
    highShelfFilter.frequency.value = 3000;
    highShelfFilter.gain.value = currentBrightness;

    sourceNode.connect(gainNode);
    gainNode.connect(deEsserFilter);
    deEsserFilter.connect(highShelfFilter);
    highShelfFilter.connect(audioCtx.destination);
  } catch {
    audioCtx = null;
    sourceNode = null;
    gainNode = null;
    deEsserFilter = null;
    highShelfFilter = null;
  }

  function startPlayback() {
    audio.play().then(() => {
      // Start fade automation loop
      if (settings && (settings.fadeIn > 0 || settings.fadeOut > 0)) {
        applyFadeGain(audio, settings);
      }
    }).catch(() => {
      currentPlayingId = null;
      cleanup();
      notifyListeners();
      onEnd?.();
    });
  }

  // Handle pad start: delay actual playback
  if (hasPadStart) {
    setTimeout(startPlayback, settings.padStart * 1000);
  } else {
    startPlayback();
  }

  return audio;
}

export function setSpeed(speed: number): void {
  currentSpeed = speed;
  if (current) current.playbackRate = speed;
}

export function setDeEsser(strength: number): void {
  currentDeEsser = strength;
  if (deEsserFilter) deEsserFilter.gain.value = -(strength / 100) * 18;
}

export function setBrightness(db: number): void {
  currentBrightness = db;
  if (highShelfFilter) highShelfFilter.gain.value = db;
}

export function stopAudio(): void {
  if (current) {
    const audio = current;
    const cb = onStopCallback;
    currentPlayingId = null;
    cleanup();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    notifyListeners();
    cb?.();
  }
}

export function isPlaying(): boolean {
  return current !== null && !current.paused;
}

export function getCurrentAudio(): HTMLAudioElement | null {
  return current;
}

export function seekAudio(fraction: number): void {
  if (current && current.duration) {
    current.currentTime = fraction * current.duration;
  }
}
