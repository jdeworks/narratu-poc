/**
 * Hook that decodes a segment's audio, processes it through the pipeline
 * with current settings, and returns peaks + a playable blob URL.
 * Re-processes (debounced) when settings change.
 */

import { useEffect, useRef, useState } from "react";
import { cachedFetch } from "./audio-cache";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { processSegment, generatePinkNoise, DEFAULT_CONFIG, type AssemblyConfig } from "../engine/audio-processor";
import { computePeaks } from "./peak-utils";

export interface ProcessedWaveform {
  /** Peak data for processed audio only (no gap) */
  peaks: number[];
  /** Total duration including gap (seconds) */
  duration: number;
  /** Duration of audio only, no gap (seconds) */
  audioDuration: number;
  /** Blob URL for playing gap + processed audio */
  playUrl: string;
  gapMs: number;
  fadeMs: number;
  /** Fraction of total duration that is gap (0-1) */
  gapFraction: number;
  /** Stable noise pattern for gap rendering */
  noisePeaks: number[];
}

export function useProcessedSegment(
  segmentId: string,
  speaker: string,
  voiceText: string,
  audioUrl: string | undefined,
  enabled: boolean,
): ProcessedWaveform | null {
  const [result, setResult] = useState<ProcessedWaveform | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const prevBlobUrl = useRef<string | null>(null);
  const decodedFlag = useRef(0); // increments after decode to trigger processing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segSettings = useSegmentSettingsStore((s) => s.settings[segmentId]?.audio);

  // Decode audio once
  useEffect(() => {
    if (!enabled || !audioUrl || audioBufferRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await cachedFetch(audioUrl);
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        audioBufferRef.current = await ctx.decodeAudioData(buf);
        await ctx.close();
        if (!cancelled) {
          decodedFlag.current++;
          // Process immediately after decode (no debounce for first run)
          runProcess();
        }
      } catch { /* ok */ }
    })();

    return () => { cancelled = true; };
  }, [enabled, audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function runProcess() {
    const audioBuf = audioBufferRef.current;
    if (!audioBuf) return;
    const ss = useSegmentSettingsStore.getState().settings[segmentId]?.audio;
    if (!ss) return;

    const config: AssemblyConfig = {
      ...DEFAULT_CONFIG,
      targetLufs: ss.targetLufs.value,
      peakLimitDb: ss.peakLimitDb.value,
      earlyStopMs: ss.earlyStopMs.value,
      fadeInMs: ss.fadeInMs.value,
      fadeOutMs: ss.fadeOutMs.value,
      fadeInStrength: ss.fadeInStrength.value,
      fadeOutStrength: ss.fadeOutStrength.value,
    };

    const processed = processSegment(
      { id: segmentId, speaker, voiceText, audioBuffer: audioBuf },
      config,
    );

    const segPeaks = computePeaks(processed.pcm, 200);

    // Build combined PCM: gap pink noise + processed audio
    const gapMs = ss.gapBeforeMs.value;
    const gapSamples = Math.floor((gapMs / 1000) * processed.sampleRate);
    const gapPcm = gapSamples > 0 ? generatePinkNoise(gapSamples, -52) : new Float32Array(0);
    const combined = new Float32Array(gapPcm.length + processed.pcm.length);
    combined.set(gapPcm, 0);
    combined.set(processed.pcm, gapPcm.length);

    const wavBlob = pcmToWav(combined, processed.sampleRate);
    if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    const playUrl = URL.createObjectURL(wavBlob);
    prevBlobUrl.current = playUrl;

    // Stable noise peaks for visual rendering
    const noiseBuckets = Math.max(10, Math.round(gapMs / 5));
    const noisePeaks = generateStableNoise(segmentId, noiseBuckets);

    const totalDuration = combined.length / processed.sampleRate;

    setResult({
      peaks: segPeaks,
      duration: totalDuration,
      playUrl,
      gapMs,
      fadeMs: ss.fadeOutMs.value,
      noisePeaks,
      /** Fraction of total duration that is gap */
      gapFraction: gapSamples / combined.length,
      /** Duration of just the audio part (no gap) */
      audioDuration: processed.pcm.length / processed.sampleRate,
    });
  }

  // Debounced re-process when settings change (150ms)
  useEffect(() => {
    if (!enabled || !audioBufferRef.current || !segSettings) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runProcess, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [enabled, segSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current); };
  }, []);

  return result;
}

/** Generate stable noise peaks from a string seed */
function generateStableNoise(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    h = ((h * 1103515245 + 12345) & 0x7fffffff);
    peaks.push((h % 1000) / 1000 * 0.15);
  }
  return peaks;
}

/** Minimal WAV encoder for playback (16-bit mono) */
function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const w = (off: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };

  w(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, dataSize, true);

  let p = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    p += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
