/**
 * Mixer playback engine — streams segment audio with lookahead buffering.
 * Only decodes 3-5 segments ahead of the cursor to avoid lag.
 * Supports live mixing: volume/fade changes take effect immediately.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMixerStore, type MixerRegion } from "../stores/mixer-store";
import { useSoundStore } from "../stores/sound-store";
import { cachedFetch } from "./audio-cache";
import { createAudioContext, ensureResumed, safeDecode } from "./audio-context";

const IS_DEV = (import.meta as any).env?.DEV;

const LOOKAHEAD = 4; // decode this many segments ahead

/**
 * Boost factor for region playback — LLM-suggested volumes (0.18-0.25 music,
 * 0.35-0.65 SFX) are relative mix levels, not gain levels. Multiply to make
 * them audible alongside full-volume speaker tracks.
 */
/** Volume values are used directly as gain (0-1). No boost needed. */

let audioCtx: AudioContext | null = null;
let scheduledSources: AudioBufferSourceNode[] = [];
let gainNodes: GainNode[] = []; // all gain nodes (for cleanup)
let startTime = 0;
let startOffsetMs = 0;
let animFrame = 0;
let bufferCache = new Map<string, AudioBuffer>();
let stopped = false;
let playbackGeneration = 0; // increments on each start, stale async ops check this

/** Live gain nodes keyed by region ID — updated in real-time when user adjusts volume */
let regionGainNodes = new Map<string, GainNode>();

/** Zustand unsubscribe for live mixing */
let storeUnsubscribe: (() => void) | null = null;

/** Decode a single segment and cache it */
async function decodeOne(id: string, url: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  if (bufferCache.has(id)) return bufferCache.get(id)!;
  try {
    const res = await cachedFetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const data = await res.arrayBuffer();
    if (data.byteLength === 0) throw new Error("empty response");
    const buf = await safeDecode(ctx, data);
    bufferCache.set(id, buf);
    return buf;
  } catch (err) {
    if (IS_DEV) console.warn(`[mixer] decode failed for "${id}":`, err);
    return null;
  }
}

/** Schedule a segment for playback */
function scheduleSegment(buf: AudioBuffer, seg: { offsetMs: number; durationMs: number }, ctx: AudioContext) {
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);

  const delayMs = Math.max(0, seg.offsetMs - startOffsetMs);
  const offsetIntoSeg = Math.max(0, startOffsetMs - seg.offsetMs);
  const remainingMs = seg.durationMs - offsetIntoSeg;

  source.start(
    startTime + delayMs / 1000,
    offsetIntoSeg / 1000,
    remainingMs > 0 ? remainingMs / 1000 : undefined,
  );
  scheduledSources.push(source);
}

/** Apply volume to a gain node immediately (no fade scheduling) */
function applyLiveVolume(gainNode: GainNode, region: MixerRegion) {
  if (!audioCtx) return;
  const vol = region.volume;
  const now = audioCtx.currentTime;

  // Cancel any pending automation and set volume immediately
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(vol, now);

  // Re-schedule fade out if applicable
  const regionEndTime = startTime + Math.max(0, region.offsetMs + region.durationMs - startOffsetMs) / 1000;
  const fadeOutSec = (region.fadeOutMs ?? 0) / 1000;
  if (fadeOutSec > 0 && regionEndTime - fadeOutSec > now) {
    gainNode.gain.setValueAtTime(vol, regionEndTime - fadeOutSec);
    gainNode.gain.linearRampToValueAtTime(0, regionEndTime);
  }
}

/** Schedule all music/SFX regions with volume */
async function scheduleRegions(ctx: AudioContext, generation: number) {
  const { regions } = useMixerStore.getState();
  const { generated } = useSoundStore.getState();

  for (const region of regions) {
    if (stopped || !audioCtx || generation !== playbackGeneration) return;

    // Find generated audio for this region (match by prompt or strip "auto-" prefix)
    const baseId = region.id.replace(/^auto-/, "").replace(/-p\d+$/, "");
    const gen = generated[baseId];
    if (!gen?.blobUrl) {
      if (IS_DEV) console.warn(`[mixer] No audio for region "${region.id}" (baseId="${baseId}")`);
      continue;
    }

    // Skip regions fully before cursor
    const regionEndMs = region.offsetMs + region.durationMs;
    if (regionEndMs < startOffsetMs) continue;

    try {
      const buf = await decodeOne(`region-${region.id}`, gen.blobUrl, ctx);
      if (!buf || stopped || !audioCtx) continue;

      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = region.loop;

      // Apply volume + fade envelopes via gain node
      const gainNode = ctx.createGain();
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Store for live updates + cleanup
      regionGainNodes.set(region.id, gainNode);
      gainNodes.push(gainNode);

      const vol = region.volume;

      const delayMs = Math.max(0, region.offsetMs - startOffsetMs);
      const offsetIntoRegion = Math.max(0, startOffsetMs - region.offsetMs);
      const regionStartTime = startTime + delayMs / 1000;
      const regionEndTime = startTime + Math.max(0, region.offsetMs + region.durationMs - startOffsetMs) / 1000;

      // Skip if region already fully past
      if (regionEndTime <= regionStartTime) continue;

      // Fade in
      const fadeInSec = (region.fadeInMs ?? 0) / 1000;
      if (fadeInSec > 0 && offsetIntoRegion < (region.fadeInMs ?? 0)) {
        gainNode.gain.setValueAtTime(0, regionStartTime);
        gainNode.gain.linearRampToValueAtTime(vol, regionStartTime + fadeInSec);
      } else {
        gainNode.gain.setValueAtTime(vol, regionStartTime);
      }

      // Fade out
      const fadeOutSec = (region.fadeOutMs ?? 0) / 1000;
      if (fadeOutSec > 0 && regionEndTime - fadeOutSec > regionStartTime) {
        gainNode.gain.setValueAtTime(vol, regionEndTime - fadeOutSec);
        gainNode.gain.linearRampToValueAtTime(0, regionEndTime);
      }

      source.start(
        regionStartTime,
        offsetIntoRegion / 1000,
        region.loop ? undefined : region.durationMs / 1000,
      );

      // Stop looping regions at their end time
      if (region.loop) {
        if (regionEndTime > ctx.currentTime) source.stop(regionEndTime);
      }

      scheduledSources.push(source);
    } catch (err) {
      if (IS_DEV) console.warn(`[mixer] Failed to schedule region "${region.id}":`, err);
    }
  }
}

/** Subscribe to store changes and update gain nodes live during playback */
function startLiveMixing() {
  let prevRegions = useMixerStore.getState().regions;

  storeUnsubscribe = useMixerStore.subscribe((state) => {
    if (!audioCtx || stopped) return;
    const regions = state.regions;
    if (regions === prevRegions) return;

    for (const region of regions) {
      const gainNode = regionGainNodes.get(region.id);
      if (gainNode) {
        applyLiveVolume(gainNode, region);
      }
    }
    prevRegions = regions;
  });
}

/** Load and schedule segments in a rolling window ahead of cursor */
async function bufferAhead(
  segmentUrls: Record<string, string>,
  fromIdx: number,
  gen: number,
) {
  const ctx = audioCtx;
  if (!ctx || stopped || gen !== playbackGeneration) return;

  const { segments } = useMixerStore.getState();
  const endIdx = Math.min(fromIdx + LOOKAHEAD, segments.length);

  for (let i = fromIdx; i < endIdx; i++) {
    if (stopped || !audioCtx || gen !== playbackGeneration) return;
    const seg = segments[i];
    const url = segmentUrls[seg.id];
    if (!url) continue;

    const currentMs = startOffsetMs + (ctx.currentTime - startTime) * 1000;
    if (seg.offsetMs + seg.durationMs < currentMs) continue;

    const buf = await decodeOne(seg.id, url, ctx);
    if (buf && !stopped && audioCtx && gen === playbackGeneration) {
      scheduleSegment(buf, seg, ctx);
    }
  }

  if (endIdx < segments.length && !stopped && gen === playbackGeneration) {
    const nextSeg = segments[Math.min(endIdx - 2, segments.length - 1)];
    const currentMs = startOffsetMs + (ctx.currentTime - startTime) * 1000;
    const timeUntilNeeded = Math.max(0, nextSeg.offsetMs - currentMs);

    setTimeout(() => {
      if (!stopped && audioCtx && gen === playbackGeneration) {
        bufferAhead(segmentUrls, endIdx, gen);
      }
    }, Math.max(100, timeUntilNeeded * 0.5));
  }
}

/** Start playback from current cursor position */
export async function startPlayback(segmentUrls: Record<string, string>) {
  stopPlayback();
  stopped = false;
  const gen = ++playbackGeneration;

  const store = useMixerStore.getState();
  const { segments, cursorMs } = store;
  if (segments.length === 0) return;

  audioCtx = createAudioContext();
  await ensureResumed(audioCtx);
  startOffsetMs = cursorMs;
  startTime = audioCtx.currentTime;

  store.setPlaybackState("playing");

  // Find the first segment at or after cursor
  const startIdx = segments.findIndex((s) => s.offsetMs + s.durationMs >= cursorMs);
  const fromIdx = Math.max(0, startIdx);

  // Start buffering speaker segments ahead
  bufferAhead(segmentUrls, fromIdx, gen);

  // Schedule music/SFX regions from sound store
  scheduleRegions(audioCtx, gen);

  // Start live mixing (volume/fade changes during playback)
  startLiveMixing();

  // Animate cursor
  function tick() {
    if (!audioCtx || stopped) return;
    const elapsed = (audioCtx.currentTime - startTime) * 1000;
    const currentMs = startOffsetMs + elapsed;
    useMixerStore.getState().setCursorMs(currentMs);

    if (currentMs >= store.totalDurationMs) {
      stopPlayback();
      return;
    }

    animFrame = requestAnimationFrame(tick);
  }
  animFrame = requestAnimationFrame(tick);
}

/** Stop all playback */
export function stopPlayback() {
  stopped = true;
  cancelAnimationFrame(animFrame);

  // Unsubscribe from live mixing
  if (storeUnsubscribe) { storeUnsubscribe(); storeUnsubscribe = null; }
  regionGainNodes.clear();

  // Disconnect all sources and gain nodes
  for (const s of scheduledSources) {
    try { s.stop(); } catch { /* ok */ }
    try { s.disconnect(); } catch { /* ok */ }
  }
  for (const g of gainNodes) {
    try { g.disconnect(); } catch { /* ok */ }
  }
  scheduledSources = [];
  gainNodes = [];
  if (audioCtx) {
    try { audioCtx.close(); } catch { /* ok */ }
    audioCtx = null;
  }
  useMixerStore.getState().setPlaybackState("stopped");
}

/** Clear the decode cache (call when segments change) */
export function clearPlaybackCache() {
  bufferCache = new Map();
}

/** Seek to a new position during playback (stop + restart from ms) */
export function seekPlayback(segmentUrls: Record<string, string>, ms: number) {
  useMixerStore.getState().setCursorMs(ms);
  startPlayback(segmentUrls);
}

/** Toggle play/pause */
export function togglePlayback(segmentUrls: Record<string, string>) {
  const state = useMixerStore.getState().playbackState;
  if (state === "playing") {
    stopPlayback();
  } else {
    startPlayback(segmentUrls);
  }
}
