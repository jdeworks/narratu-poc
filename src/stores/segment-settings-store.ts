import { create } from "zustand";
import type {
  SegmentSettings,
  SegmentAudioSettings,
  TrackedValue,
  DeviationReport,
  SpeakerPattern,
  SettingOrigin,
} from "../types/segment-settings";
import { DEFAULT_CONFIG, computeGapMs, type GapContext } from "../engine/audio-processor";
import type { TextSegment } from "../stores/project-store";

// ── Helpers ──────────────────────────────────────────────────────────────────

function tracked<T>(value: T, origin: SettingOrigin = "default"): TrackedValue<T> {
  return { value, origin, defaultValue: value };
}

function withAnalyzed<T>(tv: TrackedValue<T>, analyzed: T): TrackedValue<T> {
  return { ...tv, value: analyzed, origin: "analyzed", analyzedValue: analyzed };
}

function withUser<T>(tv: TrackedValue<T>, userVal: T): TrackedValue<T> {
  return { ...tv, value: userVal, origin: "user" };
}

function clearToAnalyzedOrDefault<T>(tv: TrackedValue<T>): TrackedValue<T> {
  if (tv.analyzedValue !== undefined) {
    return { ...tv, value: tv.analyzedValue, origin: "analyzed" };
  }
  return { ...tv, value: tv.defaultValue, origin: "default" };
}

/** Baseline gap used as the "default" tier — context-aware gaps go in "analyzed" */
const BASELINE_GAP_MS = 400;

/** Build default audio settings with fixed baseline values */
function defaultAudioSettings(): SegmentAudioSettings {
  return {
    gapBeforeMs: tracked(BASELINE_GAP_MS),
    targetLufs: tracked(DEFAULT_CONFIG.targetLufs),
    peakLimitDb: tracked(DEFAULT_CONFIG.peakLimitDb),
    earlyStopMs: tracked(0),
    fadeInMs: tracked(DEFAULT_CONFIG.fadeInMs),
    fadeOutMs: tracked(DEFAULT_CONFIG.fadeOutMs),
    fadeInStrength: tracked(DEFAULT_CONFIG.fadeInStrength),
    fadeOutStrength: tracked(DEFAULT_CONFIG.fadeOutStrength),
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

interface SegmentSettingsState {
  /** Per-segment settings keyed by segment ID */
  settings: Record<string, SegmentSettings>;

  /** Initialize settings for all segments with defaults + gap computation */
  initFromSegments: (segments: TextSegment[]) => void;

  /** Apply analyzed values (from segment-analyzer) */
  applyAnalyzed: (analyzed: Record<string, Partial<Record<keyof SegmentAudioSettings, number>>>) => void;

  /** Set a user override on one audio setting */
  setAudioOverride: (segmentId: string, key: keyof SegmentAudioSettings, value: number) => void;

  /** Clear a user override (falls back to analyzed or default) */
  clearAudioOverride: (segmentId: string, key: keyof SegmentAudioSettings) => void;

  /** Clear an analyzed value back to default */
  clearToDefault: (segmentId: string, key: keyof SegmentAudioSettings) => void;

  /** Set a user override on content (emotion/inflection/voiceText) */
  setContentOverride: (segmentId: string, key: "emotion" | "inflection" | "voiceText", value: string) => void;

  /** Generate the deviation report */
  getReport: () => DeviationReport;
}

export const useSegmentSettingsStore = create<SegmentSettingsState>((set, get) => ({
  settings: {},

  initFromSegments(segments: TextSegment[]) {
    const settings: Record<string, SegmentSettings> = {};

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const gapCtx: GapContext = {
        prevSpeaker: i > 0 ? segments[i - 1].speaker : null,
        currentSpeaker: seg.speaker,
        nextSpeaker: i < segments.length - 1 ? segments[i + 1].speaker : null,
        prevTrailingSilenceRatio: 0.3,
        isShortSegment: false,
        isFirstSegment: i === 0,
        isLastSegment: i === segments.length - 1,
      };
      const gapMs = computeGapMs(gapCtx);

      const audio = defaultAudioSettings();
      // Context-aware gap goes into the "analyzed" tier (not default)
      if (gapMs !== BASELINE_GAP_MS) {
        audio.gapBeforeMs = withAnalyzed(audio.gapBeforeMs, gapMs);
      }

      settings[seg.id] = {
        segmentId: seg.id,
        speaker: seg.speaker,
        audio,
        content: {
          emotion: tracked(seg.emotion),
          inflection: tracked(seg.inflection),
          voiceText: tracked(seg.voiceText),
        },
      };
    }

    set({ settings });
  },

  applyAnalyzed(analyzed) {
    set((state) => {
      const next = { ...state.settings };
      for (const [segId, overrides] of Object.entries(analyzed)) {
        const seg = next[segId];
        if (!seg) continue;
        const audio = { ...seg.audio };
        for (const [key, val] of Object.entries(overrides)) {
          const k = key as keyof SegmentAudioSettings;
          if (audio[k] && val !== undefined) {
            audio[k] = withAnalyzed(audio[k], val);
          }
        }
        next[segId] = { ...seg, audio };
      }
      return { settings: next };
    });
  },

  setAudioOverride(segmentId, key, value) {
    set((state) => {
      const seg = state.settings[segmentId];
      if (!seg) return state;
      const tv = seg.audio[key];
      // Auto-collapse: if value matches analyzed or default, don't mark as "user"
      let updated: TrackedValue<number>;
      if (tv.analyzedValue !== undefined && value === tv.analyzedValue) {
        updated = { ...tv, value, origin: "analyzed" };
      } else if (value === tv.defaultValue) {
        updated = { ...tv, value, origin: "default" };
      } else {
        updated = withUser(tv, value);
      }
      return {
        settings: {
          ...state.settings,
          [segmentId]: {
            ...seg,
            audio: { ...seg.audio, [key]: updated },
          },
        },
      };
    });
  },

  clearAudioOverride(segmentId, key) {
    set((state) => {
      const seg = state.settings[segmentId];
      if (!seg) return state;
      return {
        settings: {
          ...state.settings,
          [segmentId]: {
            ...seg,
            audio: { ...seg.audio, [key]: clearToAnalyzedOrDefault(seg.audio[key]) },
          },
        },
      };
    });
  },

  clearToDefault(segmentId, key) {
    set((state) => {
      const seg = state.settings[segmentId];
      if (!seg) return state;
      const tv = seg.audio[key];
      return {
        settings: {
          ...state.settings,
          [segmentId]: {
            ...seg,
            audio: { ...seg.audio, [key]: { ...tv, value: tv.defaultValue, origin: "default" as const } },
          },
        },
      };
    });
  },

  setContentOverride(segmentId, key, value) {
    set((state) => {
      const seg = state.settings[segmentId];
      if (!seg) return state;
      const tv = seg.content[key];
      let updated: TrackedValue<string>;
      if (tv.analyzedValue !== undefined && value === tv.analyzedValue) {
        updated = { ...tv, value, origin: "analyzed" };
      } else if (value === tv.defaultValue) {
        updated = { ...tv, value, origin: "default" };
      } else {
        updated = withUser(tv, value);
      }
      return {
        settings: {
          ...state.settings,
          [segmentId]: {
            ...seg,
            content: { ...seg.content, [key]: updated },
          },
        },
      };
    });
  },

  getReport(): DeviationReport {
    const { settings } = get();
    const allSettings = Object.values(settings);
    const total = allSettings.length;

    let overridesAnalyzed = 0;
    let overridesUser = 0;
    let withAnyOverride = 0;

    // Per-speaker aggregation
    const bySpeaker: Record<string, { gaps: number[]; lufs: number[]; overrides: number; count: number }> = {};

    for (const seg of allSettings) {
      let hasOverride = false;
      const sp = bySpeaker[seg.speaker] ??= { gaps: [], lufs: [], overrides: 0, count: 0 };
      sp.count++;

      for (const tv of Object.values(seg.audio)) {
        if (tv.origin === "analyzed") overridesAnalyzed++;
        if (tv.origin === "user") { overridesUser++; hasOverride = true; sp.overrides++; }
      }

      // Track gap and LUFS deviations
      const gapDev = seg.audio.gapBeforeMs.value - seg.audio.gapBeforeMs.defaultValue;
      const lufsDev = seg.audio.targetLufs.value - seg.audio.targetLufs.defaultValue;
      if (gapDev !== 0) sp.gaps.push(gapDev);
      if (lufsDev !== 0) sp.lufs.push(lufsDev);

      if (hasOverride) withAnyOverride++;
    }

    const speakerPatterns: SpeakerPattern[] = Object.entries(bySpeaker).map(([speaker, data]) => {
      const avgGap = data.gaps.length > 0 ? data.gaps.reduce((a, b) => a + b, 0) / data.gaps.length : 0;
      const avgLufs = data.lufs.length > 0 ? data.lufs.reduce((a, b) => a + b, 0) / data.lufs.length : 0;
      const patterns: string[] = [];
      if (Math.abs(avgGap) > 30) patterns.push(`${avgGap > 0 ? "+" : ""}${Math.round(avgGap)}ms avg gap shift`);
      if (Math.abs(avgLufs) > 0.5) patterns.push(`${avgLufs > 0 ? "+" : ""}${avgLufs.toFixed(1)} LUFS avg shift`);
      if (data.overrides > 0) patterns.push(`${data.overrides} manual override${data.overrides > 1 ? "s" : ""}`);

      return {
        speaker,
        segmentCount: data.count,
        overrideCount: data.overrides,
        avgGapDeviation: Math.round(avgGap),
        avgLufsDeviation: parseFloat(avgLufs.toFixed(1)),
        patterns,
      };
    });

    return {
      totalSegments: total,
      segmentsWithOverrides: withAnyOverride,
      overridesByOrigin: { analyzed: overridesAnalyzed, user: overridesUser },
      speakerPatterns,
      characterDeviations: [], // Populated in Phase 5
    };
  },
}));
