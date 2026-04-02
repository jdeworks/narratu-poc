/**
 * Rule-based segment analyzer that computes optimized audio settings
 * per segment based on context: emotion, inflection, speaker transitions,
 * and neighboring segments. Deterministic and fast (<10ms for 60 segments).
 */

import { DEFAULT_CONFIG, computeGapMs, type GapContext } from "./audio-processor";
import type { TextSegment } from "../stores/project-store";
import type { SegmentAudioSettings } from "../types/segment-settings";

/** Analyzed recommendation for one segment (only non-default values) */
export type AnalyzedOverrides = Partial<Record<keyof SegmentAudioSettings, number>>;

// ── Emotion/inflection rules ─────────────────────────────────────────────

const EMOTION_GAP_BONUS: Record<string, number> = {
  dramatic: 150, suspenseful: 120, tense: 100, shocked: 80,
  sad: 80, grief: 100, solemn: 60,
  angry: -50, urgent: -80, excited: -30,
};

const INFLECTION_LUFS_OFFSET: Record<string, number> = {
  whispering: -3, hushed: -2, soft: -1.5, gentle: -1,
  shouting: 2, loud: 1.5, commanding: 1, forceful: 1,
};

const EMOTION_FADE_BONUS: Record<string, number> = {
  dramatic: 3, suspenseful: 2, tense: 2, solemn: 2,
  trailing: 4, fading: 5,
};

// ── Main analyzer ────────────────────────────────────────────────────────

/**
 * Analyze all segments and return optimized settings per segment.
 * Only returns values that differ from defaults.
 */
export function analyzeSegments(segments: TextSegment[]): Record<string, AnalyzedOverrides> {
  const result: Record<string, AnalyzedOverrides> = {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = i > 0 ? segments[i - 1] : null;
    const next = i < segments.length - 1 ? segments[i + 1] : null;
    const overrides: AnalyzedOverrides = {};

    // 1. Gap: start from computeGapMs, then adjust for emotion/context
    const gapCtx: GapContext = {
      prevSpeaker: prev?.speaker ?? null,
      currentSpeaker: seg.speaker,
      nextSpeaker: next?.speaker ?? null,
      prevTrailingSilenceRatio: 0.3,
      isShortSegment: false,
      isFirstSegment: i === 0,
      isLastSegment: i === segments.length - 1,
    };
    let gap = computeGapMs(gapCtx);

    // Emotion-based gap adjustments
    const emotionLower = seg.emotion.toLowerCase();
    for (const [keyword, bonus] of Object.entries(EMOTION_GAP_BONUS)) {
      if (emotionLower.includes(keyword)) { gap += bonus; break; }
    }

    // After a long narrator passage, add breathing room
    if (prev?.speaker === "Narrator" && seg.speaker !== "Narrator") {
      const prevLen = prev.voiceText.length;
      if (prevLen > 200) gap += 50;
    }

    // Dramatic pause before a reveal (short segment after long buildup)
    if (prev && prev.voiceText.length > 150 && seg.voiceText.length < 40) {
      gap += 80;
    }

    gap = Math.max(0, Math.min(1200, gap));
    overrides.gapBeforeMs = gap;

    // 2. LUFS: adjust for inflection
    let lufs = DEFAULT_CONFIG.targetLufs;
    const inflLower = seg.inflection.toLowerCase();
    for (const [keyword, offset] of Object.entries(INFLECTION_LUFS_OFFSET)) {
      if (inflLower.includes(keyword)) { lufs += offset; break; }
    }
    if (lufs !== DEFAULT_CONFIG.targetLufs) {
      overrides.targetLufs = Math.max(-30, Math.min(-10, lufs));
    }

    // 3. Fade-out: extend for dramatic/trailing emotions
    let fadeOut = DEFAULT_CONFIG.fadeOutMs;
    for (const [keyword, bonus] of Object.entries(EMOTION_FADE_BONUS)) {
      if (emotionLower.includes(keyword)) { fadeOut += bonus * 10; break; }
    }
    if (fadeOut !== DEFAULT_CONFIG.fadeOutMs) {
      overrides.fadeOutMs = Math.min(300, fadeOut);
    }

    // 4. Fade-in: shorter for shouted/forceful, longer for whispered
    if (inflLower.includes("whisper") || inflLower.includes("hushed") || inflLower.includes("soft")) {
      overrides.fadeInMs = 25; // gentle entry
    } else if (inflLower.includes("shout") || inflLower.includes("command") || inflLower.includes("forceful")) {
      overrides.fadeInMs = 5; // preserve attack
    }

    // Only store if we have non-default values
    if (Object.keys(overrides).length > 0) {
      result[seg.id] = overrides;
    }
  }

  return result;
}
