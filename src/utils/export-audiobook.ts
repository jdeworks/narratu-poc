import { processSegment, assembleAudiobook, DEFAULT_CONFIG, type SegmentInput, type AssemblyConfig } from "../engine/audio-processor";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { cachedFetch } from "./audio-cache";
import { createAudioContext, safeDecode } from "./audio-context";

export interface ExportProgress {
  phase: "decoding" | "processing" | "assembling" | "mixing" | "encoding" | "done";
  current: number;
  total: number;
}

/**
 * Full export pipeline: fetch segment MP3s → decode → process → assemble → WAV blob.
 * Reports progress via callback.
 */
export async function exportAudiobook(
  segmentAudioUrls: Record<string, string>,
  segments: { id: string; speaker: string; voiceText: string }[],
  onProgress: (p: ExportProgress) => void,
): Promise<Blob> {
  const total = segments.length;

  // 1. Decode all segment audio files
  onProgress({ phase: "decoding", current: 0, total });
  const ctx = createAudioContext();
  const decoded: Map<string, AudioBuffer> = new Map();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const url = segmentAudioUrls[seg.id];
    if (!url) continue;

    const res = await cachedFetch(url);
    const buf = await res.arrayBuffer();
    const audio = await safeDecode(ctx, buf);
    decoded.set(seg.id, audio);
    onProgress({ phase: "decoding", current: i + 1, total });
  }

  // 2. Process each segment (using per-segment settings when available)
  onProgress({ phase: "processing", current: 0, total });
  const inputs: SegmentInput[] = [];
  const settingsState = useSegmentSettingsStore.getState().settings;

  for (const seg of segments) {
    const audioBuf = decoded.get(seg.id);
    if (!audioBuf) continue;
    inputs.push({ id: seg.id, speaker: seg.speaker, voiceText: seg.voiceText, audioBuffer: audioBuf });
  }

  const processed = inputs.map((input, i) => {
    const ss = settingsState[input.id]?.audio;
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
    const result = processSegment(input, config);
    onProgress({ phase: "processing", current: i + 1, total });
    return result;
  });

  // 3. Assemble
  onProgress({ phase: "assembling", current: 0, total: 1 });
  const voiceTexts = segments.map((s) => s.voiceText);
  const assembly = assembleAudiobook(processed, voiceTexts);
  onProgress({ phase: "assembling", current: 1, total: 1 });

  // 4. Encode to MP3
  onProgress({ phase: "encoding", current: 0, total: 1 });
  const blob = await encodeMp3(assembly.pcm, assembly.sampleRate);
  onProgress({ phase: "encoding", current: 1, total: 1 });

  onProgress({ phase: "done", current: 1, total: 1 });
  await ctx.close();
  return blob;
}

/** Encode Float32Array PCM to MP3 via lamejs */
async function encodeMp3(pcm: Float32Array, sampleRate: number): Promise<Blob> {
  // Dynamic import to keep lamejs out of the main bundle
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const mp3enc = new Mp3Encoder(1, sampleRate, 192); // mono, 192kbps

  // Convert float32 to int16
  const samples = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const mp3buf = mp3enc.encodeBuffer(chunk);
    if (mp3buf.length > 0) chunks.push(Uint8Array.from(mp3buf));
  }
  const tail = mp3enc.flush();
  if (tail.length > 0) chunks.push(Uint8Array.from(tail));

  // Concatenate into single buffer for Blob
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }

  return new Blob([result.buffer], { type: "audio/mpeg" });
}

/** Trigger a browser download of a blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
