/**
 * Multi-track export: mixes speakers (processed), pink noise gaps,
 * music regions, and SFX regions into a single MP3 file.
 */

import { useMixerStore } from "../stores/mixer-store";
import { useSoundStore } from "../stores/sound-store";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { processSegment, generatePinkNoise, DEFAULT_CONFIG, type AssemblyConfig } from "../engine/audio-processor";
import { cachedFetch } from "./audio-cache";
import { createAudioContext, safeDecode } from "./audio-context";

export interface MixerExportProgress {
  phase: "decoding" | "processing" | "mixing" | "encoding" | "done";
  current: number;
  total: number;
}

/**
 * Export the full mixer timeline as an MP3 file.
 * Decodes all segment audio, processes with current settings,
 * mixes in music/SFX regions at their offsets.
 */
export async function exportMixerTimeline(
  segmentAudioUrls: Record<string, string>,
  onProgress: (p: MixerExportProgress) => void,
): Promise<Blob> {
  const { segments, regions, totalDurationMs } = useMixerStore.getState();
  const settingsState = useSegmentSettingsStore.getState().settings;

  // Use the AudioContext's actual sample rate (system rate, e.g. 48000)
  // so decoded audio matches the output buffer's rate.
  const audioCtx = createAudioContext();
  const sampleRate = audioCtx.sampleRate;
  const totalSamples = Math.ceil((totalDurationMs / 1000 + 1) * sampleRate); // +1s tail
  const output = new Float32Array(totalSamples);

  // 1. Fill with pink noise at -52dB (room tone)
  const noise = generatePinkNoise(totalSamples, -52);
  output.set(noise);

  // 2. Decode and process each segment
  const total = segments.length;
  onProgress({ phase: "decoding", current: 0, total });
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const url = segmentAudioUrls[seg.id];
    if (!url) continue;

    try {
      const res = await cachedFetch(url);
      const buf = await res.arrayBuffer();
      const decoded = await safeDecode(audioCtx, buf);

      onProgress({ phase: "processing", current: i + 1, total });

      // Process with current settings
      const ss = settingsState[seg.id]?.audio;
      const config: AssemblyConfig = ss ? {
        ...DEFAULT_CONFIG,
        targetLufs: ss.targetLufs.value,
        peakLimitDb: ss.peakLimitDb.value,
        earlyStopMs: ss.earlyStopMs.value,
        fadeInMs: ss.fadeInMs.value,
        fadeOutMs: ss.fadeOutMs.value,
        fadeInStrength: ss.fadeInStrength.value,
        fadeOutStrength: ss.fadeOutStrength.value,
      } : DEFAULT_CONFIG;

      const processed = processSegment({
        id: seg.id,
        speaker: seg.speaker,
        voiceText: "",
        audioBuffer: decoded,
      }, config);

      // Write processed PCM at the segment's offset
      const offsetSamples = Math.floor((seg.offsetMs / 1000) * sampleRate);
      for (let j = 0; j < processed.pcm.length && offsetSamples + j < totalSamples; j++) {
        output[offsetSamples + j] = processed.pcm[j]; // Overwrite noise with speech
      }
    } catch { /* skip failed segments */ }
  }
  await audioCtx.close();

  // 3. Mix in music and SFX regions (decode from sound store blobs)
  const { generated } = useSoundStore.getState();
  onProgress({ phase: "mixing", current: 0, total: regions.length });
  const mixCtx = createAudioContext();
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const baseId = region.id.replace(/^auto-/, "").replace(/-p\d+$/, "");
    const gen = generated[baseId];
    if (!gen?.blobUrl) { onProgress({ phase: "mixing", current: i + 1, total: regions.length }); continue; }

    try {
      const res = await fetch(gen.blobUrl);
      const buf = await res.arrayBuffer();
      const decoded = await safeDecode(mixCtx, buf);
      const pcm = decoded.getChannelData(0);
      const vol = region.volume;

      const offsetSamples = Math.floor((region.offsetMs / 1000) * sampleRate);
      const regionSamples = Math.floor((region.durationMs / 1000) * sampleRate);
      const fadeInSamples = Math.floor(((region.fadeInMs ?? 0) / 1000) * sampleRate);
      const fadeOutSamples = Math.floor(((region.fadeOutMs ?? 0) / 1000) * sampleRate);

      for (let j = 0; j < regionSamples && offsetSamples + j < totalSamples; j++) {
        // Loop or clamp source index
        const srcIdx = region.loop ? j % pcm.length : j;
        if (srcIdx >= pcm.length) break;

        let gain = vol;
        if (fadeInSamples > 0 && j < fadeInSamples) gain *= j / fadeInSamples;
        if (fadeOutSamples > 0 && j > regionSamples - fadeOutSamples) gain *= (regionSamples - j) / fadeOutSamples;

        output[offsetSamples + j] += pcm[srcIdx] * gain; // Additive mix
      }
    } catch { /* skip failed regions */ }
    onProgress({ phase: "mixing", current: i + 1, total: regions.length });
  }
  await mixCtx.close();

  // 4. Encode to MP3
  onProgress({ phase: "encoding", current: 0, total: 1 });
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const mp3enc = new Mp3Encoder(1, sampleRate, 192);
  const samples = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, output[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += 1152) {
    const buf = mp3enc.encodeBuffer(samples.subarray(i, i + 1152));
    if (buf.length > 0) chunks.push(Uint8Array.from(buf));
  }
  const tail = mp3enc.flush();
  if (tail.length > 0) chunks.push(Uint8Array.from(tail));
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  const blob = new Blob([result.buffer], { type: "audio/mpeg" });
  onProgress({ phase: "done", current: 1, total: 1 });

  return blob;
}
