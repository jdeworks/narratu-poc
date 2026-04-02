/**
 * Sophisticated pattern detection across segments.
 * Runs multiple analysis passes, yields patterns progressively.
 */

import type { SegmentSettings, SegmentAudioSettings } from "../types/segment-settings";

export interface DetectedPattern {
  id: string;
  category: "audio" | "content" | "transition" | "consistency" | "outlier";
  speaker: string | null;  // null = project-wide
  severity: "info" | "suggestion" | "warning";
  title: string;
  detail: string;
}

type PatternPass = (segments: SegmentSettings[]) => DetectedPattern[];

// ── Analysis passes ──────────────────────────────────────────────────────

const speakerGapTrends: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  const bySpeaker = groupBySpeaker(segments);

  for (const [speaker, segs] of Object.entries(bySpeaker)) {
    if (segs.length < 2) continue;
    // Skip segments with 0ms gap (first segment)
    const gaps = segs.map((s) => s.audio.gapBeforeMs).filter((g) => g.value > 0);
    const analyzed = gaps.filter((g) => g.origin === "analyzed");
    const avgDev = analyzed.length > 0
      ? analyzed.reduce((sum, g) => sum + (g.value - g.defaultValue), 0) / analyzed.length
      : 0;

    if (Math.abs(avgDev) > 20) {
      patterns.push({
        id: `gap-trend-${speaker}`,
        category: "audio",
        speaker,
        severity: Math.abs(avgDev) > 100 ? "suggestion" : "info",
        title: `${speaker}: ${avgDev > 0 ? "longer" : "shorter"} gaps`,
        detail: `Average gap is ${avgDev > 0 ? "+" : ""}${Math.round(avgDev)}ms vs baseline. ${analyzed.length} of ${segs.length} segments adjusted.`,
      });
    }
  }
  return patterns;
};

const speakerLufsTrends: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  const bySpeaker = groupBySpeaker(segments);

  for (const [speaker, segs] of Object.entries(bySpeaker)) {
    const lufs = segs.map((s) => s.audio.targetLufs);
    const adjusted = lufs.filter((l) => l.origin !== "default");
    if (adjusted.length === 0) continue;

    const avgOffset = adjusted.reduce((sum, l) => sum + (l.value - l.defaultValue), 0) / adjusted.length;
    if (Math.abs(avgOffset) > 0.3) {
      const direction = avgOffset < 0 ? "quieter" : "louder";
      patterns.push({
        id: `lufs-trend-${speaker}`,
        category: "audio",
        speaker,
        severity: "info",
        title: `${speaker}: consistently ${direction}`,
        detail: `Average LUFS offset: ${avgOffset > 0 ? "+" : ""}${avgOffset.toFixed(1)}dB across ${adjusted.length} segments.`,
      });
    }
  }
  return patterns;
};

const emotionDistribution: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  const bySpeaker = groupBySpeaker(segments);

  for (const [speaker, segs] of Object.entries(bySpeaker)) {
    if (segs.length < 3) continue;
    const emotions = segs.map((s) => s.content.emotion.value.toLowerCase());
    const counts = countValues(emotions);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0];

    if (dominant && dominant[1] / segs.length > 0.6) {
      patterns.push({
        id: `emotion-dominant-${speaker}`,
        category: "content",
        speaker,
        severity: "info",
        title: `${speaker}: predominantly ${dominant[0]}`,
        detail: `${dominant[1]} of ${segs.length} segments (${Math.round(dominant[1] / segs.length * 100)}%). Consider varying for more dynamics.`,
      });
    }

    const unique = sorted.length;
    if (unique >= 4 && segs.length >= 5) {
      patterns.push({
        id: `emotion-range-${speaker}`,
        category: "content",
        speaker,
        severity: "info",
        title: `${speaker}: wide emotional range`,
        detail: `${unique} distinct emotions across ${segs.length} segments: ${sorted.slice(0, 4).map(([e]) => e).join(", ")}${unique > 4 ? "..." : ""}.`,
      });
    }
  }
  return patterns;
};

const transitionPatterns: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  let sameCount = 0;
  let diffCount = 0;
  let charToCharCount = 0;
  const transitionGaps: Record<string, number[]> = {};

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1].speaker;
    const curr = segments[i].speaker;
    const gap = segments[i].audio.gapBeforeMs.value;
    const key = `${prev}→${curr}`;
    (transitionGaps[key] ??= []).push(gap);

    if (prev === curr) sameCount++;
    else {
      diffCount++;
      if (prev !== "Narrator" && curr !== "Narrator") charToCharCount++;
    }
  }

  if (diffCount > 0) {
    patterns.push({
      id: "transition-overview",
      category: "transition",
      speaker: null,
      severity: "info",
      title: `${diffCount} speaker transitions`,
      detail: `${sameCount} same-speaker continuations, ${diffCount} transitions (${charToCharCount} character↔character).`,
    });
  }

  // Find the most common transition pair
  const sorted = Object.entries(transitionGaps).sort((a, b) => b[1].length - a[1].length);
  for (const [key, gaps] of sorted.slice(0, 3)) {
    if (gaps.length < 2) continue;
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const stddev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - avg) ** 2, 0) / gaps.length);

    if (stddev > 80) {
      patterns.push({
        id: `transition-inconsistent-${key}`,
        category: "consistency",
        speaker: null,
        severity: "suggestion",
        title: `${key}: inconsistent gap timing`,
        detail: `${gaps.length} occurrences, avg ${Math.round(avg)}ms but std dev ${Math.round(stddev)}ms. Consider normalizing.`,
      });
    }
  }

  return patterns;
};

const outlierDetection: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  // Skip first segment (0ms gap is expected)
  const gapsWithIndex = segments.slice(1).map((s, i) => ({ gap: s.audio.gapBeforeMs.value, idx: i + 1 }));
  if (gapsWithIndex.length < 5) return patterns;

  const gaps = gapsWithIndex.map((g) => g.gap);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const stddev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length);

  for (const { gap, idx } of gapsWithIndex) {
    const dev = Math.abs(gap - mean);
    if (dev > stddev * 2.5 && dev > 150) {
      patterns.push({
        id: `outlier-gap-${idx}`,
        category: "outlier",
        speaker: segments[idx].speaker,
        severity: "warning",
        title: `Segment ${idx + 1}: unusual gap (${Math.round(gap)}ms)`,
        detail: `${Math.round(dev / stddev)}σ from mean (${Math.round(mean)}ms). May sound jarring.`,
      });
    }
  }
  return patterns;
};

const textComplexity: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  const bySpeaker = groupBySpeaker(segments);

  for (const [speaker, segs] of Object.entries(bySpeaker)) {
    if (segs.length < 2) continue;
    const lengths = segs.map((s) => s.content.voiceText.value.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const short = lengths.filter((l) => l < 30).length;
    const long = lengths.filter((l) => l > 200).length;

    if (short > segs.length * 0.5 && segs.length >= 3) {
      patterns.push({
        id: `text-short-${speaker}`,
        category: "content",
        speaker,
        severity: "info",
        title: `${speaker}: mostly short segments`,
        detail: `${short} of ${segs.length} segments under 30 chars (avg ${Math.round(avg)}). Quick dialogue — may need tighter gaps.`,
      });
    }
    if (long > 0) {
      patterns.push({
        id: `text-long-${speaker}`,
        category: "content",
        speaker,
        severity: "info",
        title: `${speaker}: ${long} long passage${long > 1 ? "s" : ""}`,
        detail: `Segments over 200 chars. Consider adding breathing pauses or splitting.`,
      });
    }
  }
  return patterns;
};

const inflectionConsistency: PatternPass = (segments) => {
  const patterns: DetectedPattern[] = [];
  const bySpeaker = groupBySpeaker(segments);

  for (const [speaker, segs] of Object.entries(bySpeaker)) {
    if (segs.length < 3) continue;
    const inflections = segs.map((s) => s.content.inflection.value.toLowerCase());
    const counts = countValues(inflections);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    if (sorted.length === 1 && segs.length >= 4) {
      patterns.push({
        id: `inflection-monotone-${speaker}`,
        category: "consistency",
        speaker,
        severity: "suggestion",
        title: `${speaker}: same inflection throughout`,
        detail: `All ${segs.length} segments are "${sorted[0][0]}". Varying inflection adds life.`,
      });
    }
  }
  return patterns;
};

// ── All passes ───────────────────────────────────────────────────────────

const ALL_PASSES: { name: string; fn: PatternPass }[] = [
  { name: "Speaker gap trends", fn: speakerGapTrends },
  { name: "Speaker loudness trends", fn: speakerLufsTrends },
  { name: "Emotion distribution", fn: emotionDistribution },
  { name: "Transition patterns", fn: transitionPatterns },
  { name: "Outlier detection", fn: outlierDetection },
  { name: "Text complexity", fn: textComplexity },
  { name: "Inflection consistency", fn: inflectionConsistency },
];

/**
 * Run all pattern detection passes asynchronously.
 * Calls onProgress after each pass with cumulative results.
 */
export async function detectPatterns(
  segments: SegmentSettings[],
  onProgress: (patterns: DetectedPattern[], passName: string, done: boolean) => void,
): Promise<DetectedPattern[]> {
  const all: DetectedPattern[] = [];

  for (let i = 0; i < ALL_PASSES.length; i++) {
    const pass = ALL_PASSES[i];
    // Yield to UI between passes
    await new Promise((r) => setTimeout(r, 0));
    const found = pass.fn(segments);
    all.push(...found);
    onProgress([...all], pass.name, i === ALL_PASSES.length - 1);
  }

  return all;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function groupBySpeaker(segments: SegmentSettings[]): Record<string, SegmentSettings[]> {
  const m: Record<string, SegmentSettings[]> = {};
  for (const s of segments) (m[s.speaker] ??= []).push(s);
  return m;
}

function countValues(arr: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
