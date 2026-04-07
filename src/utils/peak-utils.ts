/** Pre-compute peak data from PCM or AudioBuffer for waveform rendering */
import { cachedFetch } from "./audio-cache";
import { createAudioContext, safeDecode } from "./audio-context";

export interface PeakData {
  peaks: number[];   // 0-1 normalized peak values
  duration: number;  // seconds
}

/** Downsample audio to N peak buckets */
export function computePeaks(channelData: Float32Array, buckets: number): number[] {
  const step = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const end = Math.min((i + 1) * step, channelData.length);
    for (let j = i * step; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks;
}

/** Decode an audio URL and return peaks + duration */
export async function loadPeaks(url: string, buckets: number): Promise<PeakData> {
  const res = await cachedFetch(url);
  const buf = await res.arrayBuffer();
  const ctx = createAudioContext();
  const decoded = await safeDecode(ctx, buf);
  const peaks = computePeaks(decoded.getChannelData(0), buckets);
  const duration = decoded.duration;
  await ctx.close();
  return { peaks, duration };
}

/** Fixed-rate peak loading: peaksPerSecond ensures consistent resolution */
export async function loadPeaksAtRate(url: string, peaksPerSecond = 50): Promise<PeakData> {
  const res = await cachedFetch(url);
  const buf = await res.arrayBuffer();
  const ctx = createAudioContext();
  const decoded = await safeDecode(ctx, buf);
  const buckets = Math.max(20, Math.round(decoded.duration * peaksPerSecond));
  const peaks = computePeaks(decoded.getChannelData(0), buckets);
  const duration = decoded.duration;
  await ctx.close();
  return { peaks, duration };
}
