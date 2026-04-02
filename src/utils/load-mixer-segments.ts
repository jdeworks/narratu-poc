/**
 * Shared loader for mixer segments — ensures segments are loaded into
 * the mixer store before operations that depend on them (like auto-place).
 * Returns immediately if already loaded.
 */

import { useMixerStore } from "../stores/mixer-store";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { computeGapMs, type GapContext } from "../engine/audio-processor";
import { loadPeaksAtRate } from "./peak-utils";

let loadingPromise: Promise<void> | null = null;

/**
 * Ensure mixer segments are loaded. Idempotent — returns immediately
 * if already loaded, or waits for an in-progress load.
 */
export async function ensureMixerSegmentsLoaded(
  segmentAudioUrls: Record<string, string>,
  segments: { id: string; speaker: string }[],
): Promise<void> {
  const store = useMixerStore.getState();
  if (store.segments.length > 0) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = doLoad(segmentAudioUrls, segments);
  await loadingPromise;
  loadingPromise = null;
}

async function doLoad(
  segmentAudioUrls: Record<string, string>,
  segments: { id: string; speaker: string }[],
): Promise<void> {
  const { addSegment, setLoading } = useMixerStore.getState();
  const settingsStore = useSegmentSettingsStore.getState();
  let offsetMs = 0;

  setLoading(true, { current: 0, total: segments.length });

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const url = segmentAudioUrls[seg.id];
    if (!url) continue;

    const segSettings = settingsStore.settings[seg.id];
    const gapMs = segSettings?.audio.gapBeforeMs.value ?? computeDefaultGap(i, segments);

    try {
      const { peaks, duration } = await loadPeaksAtRate(url, 100);
      const rawDurationMs = duration * 1000;
      const earlyStop = segSettings?.audio.earlyStopMs.value ?? 0;
      const durationMs = Math.max(0, rawDurationMs - earlyStop);

      offsetMs += gapMs;
      addSegment({
        id: seg.id,
        speaker: seg.speaker,
        offsetMs,
        durationMs,
        rawDurationMs,
        gapBeforeMs: gapMs,
        peaks,
      });
      offsetMs += durationMs;
    } catch { /* skip */ }

    setLoading(true, { current: i + 1, total: segments.length });
  }

  setLoading(false);
}

function computeDefaultGap(index: number, segments: { speaker: string }[]): number {
  const ctx: GapContext = {
    prevSpeaker: index > 0 ? segments[index - 1].speaker : null,
    currentSpeaker: segments[index].speaker,
    nextSpeaker: index < segments.length - 1 ? segments[index + 1].speaker : null,
    prevTrailingSilenceRatio: 0.3,
    isShortSegment: false,
    isFirstSegment: index === 0,
    isLastSegment: index === segments.length - 1,
  };
  return computeGapMs(ctx);
}
