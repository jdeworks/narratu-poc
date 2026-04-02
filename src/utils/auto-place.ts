/**
 * Auto-placement engine: maps LLM mixing analysis to MixerRegions
 * using real audio segment positions and word-level anchors.
 */

import type { MixingAnalysis } from "../engine/analyze-mixing";
import type { MixerSegment, MixerRegion } from "../stores/mixer-store";
import { resolveWordAnchor } from "./word-position";

interface SegmentInfo {
  id: string;
  voiceText: string;
  offsetMs: number;
  durationMs: number;
}

/**
 * Convert LLM mixing analysis into MixerRegions ready for the timeline.
 * Requires real audio segments (with actual durations from generated audio).
 *
 * @param analysis - LLM mixing analysis result
 * @param mixerSegments - Segments with real audio timing
 * @param segmentTexts - Map of segment ID → voiceText for word anchoring
 * @returns Array of MixerRegions to add to the mixer store
 */
export function autoPlaceAll(
  analysis: MixingAnalysis,
  mixerSegments: MixerSegment[],
  segmentTexts: Record<string, string>,
): MixerRegion[] {
  const regions: MixerRegion[] = [];
  const segMap = new Map(mixerSegments.map((s) => [s.id, s]));

  // ── Music: each placement becomes a region, same prompt = same audio ──

  for (const music of analysis.music) {
    for (let p = 0; p < music.placements.length; p++) {
      const placement = music.placements[p];
      const startSeg = segMap.get(placement.startSegment);
      const endSeg = segMap.get(placement.endSegment);
      if (!startSeg) continue;

      const offsetMs = startSeg.offsetMs;
      const endMs = endSeg ? endSeg.offsetMs + endSeg.durationMs : startSeg.offsetMs + startSeg.durationMs;
      const durationMs = endMs - offsetMs;

      regions.push({
        id: `auto-${music.id}-p${p}`,
        trackId: "music",
        offsetMs,
        durationMs,
        placementDurationMs: durationMs,
        peaks: [],
        volume: music.volume,
        loop: true,
        fadeInMs: music.fadeInMs,
        fadeOutMs: music.fadeOutMs,
        source: "elevenlabs-music",
        prompt: music.prompt,
      });
    }
  }

  // ── Music crossfade: overlap consecutive regions for seamless transitions ──
  // Each crossfade zone = half of outgoing fade + half of incoming fade.
  // The outgoing region extends forward, the incoming region starts earlier.
  const musicRegions = regions.filter((r) => r.trackId === "music");
  musicRegions.sort((a, b) => a.offsetMs - b.offsetMs);
  for (let i = 0; i < musicRegions.length - 1; i++) {
    const curr = musicRegions[i];
    const next = musicRegions[i + 1];
    const crossfadeMs = Math.max(curr.fadeOutMs ?? 0, next.fadeInMs ?? 0);
    if (crossfadeMs > 0) {
      const halfCrossfade = Math.round(crossfadeMs / 2);
      // Extend current region forward by half the crossfade
      const currEnd = curr.offsetMs + curr.durationMs;
      const gap = next.offsetMs - currEnd;
      curr.durationMs += gap + halfCrossfade;
      if (curr.placementDurationMs) curr.placementDurationMs = curr.durationMs;
      // Pull next region back by half the crossfade
      next.offsetMs -= halfCrossfade;
      next.durationMs += halfCrossfade;
      if (next.placementDurationMs) next.placementDurationMs = next.durationMs;
    }
  }

  // ── SFX: resolve word anchor to precise ms position ──

  for (const sfx of analysis.sfx) {
    const seg = segMap.get(sfx.segmentId);
    if (!seg) continue;

    const voiceText = segmentTexts[sfx.segmentId] ?? "";
    const resolvedMs = resolveWordAnchor(
      sfx.atWords,
      sfx.timing,
      voiceText,
      seg.offsetMs,
      seg.durationMs,
    );

    const offsetMs = resolvedMs ?? seg.offsetMs; // fallback to segment start
    const durationMs = sfx.durationSec * 1000;

    regions.push({
      id: `auto-${sfx.id}`,
      trackId: "sfx",
      offsetMs,
      durationMs,
      peaks: [],
      volume: sfx.volume,
      loop: false,
      source: "elevenlabs-sfx",
      prompt: sfx.prompt,
    });
  }

  return regions;
}
