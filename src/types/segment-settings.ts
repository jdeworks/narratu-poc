/** Origin of a setting value — tracks who/what set it */
export type SettingOrigin = "default" | "analyzed" | "user";

/** A value with provenance tracking for the three-tier merge chain */
export interface TrackedValue<T = number> {
  value: T;
  origin: SettingOrigin;
  /** The global default from DEFAULT_CONFIG */
  defaultValue: T;
  /** The AI-analyzed recommendation (if any) */
  analyzedValue?: T;
}

/** Audio processing settings tracked per segment */
export interface SegmentAudioSettings {
  gapBeforeMs: TrackedValue;
  targetLufs: TrackedValue;
  peakLimitDb: TrackedValue;
  /** Extra ms to trim from the end to remove trailing clicks/artifacts (0 = none) */
  earlyStopMs: TrackedValue;
  /** Fade-in duration at segment start (ms) */
  fadeInMs: TrackedValue;
  /** Fade-out duration at segment end (ms) */
  fadeOutMs: TrackedValue;
  /** Fade-in curve strength: 0=linear, 50=standard(quarter-sine), 100=aggressive */
  fadeInStrength: TrackedValue;
  /** Fade-out curve strength: 0=linear, 50=standard(cosine), 100=aggressive */
  fadeOutStrength: TrackedValue;
}

/** Character-level attribute tracking (string values) */
export interface SegmentContentSettings {
  emotion: TrackedValue<string>;
  inflection: TrackedValue<string>;
  voiceText: TrackedValue<string>;
}

/** Full tracked settings for one segment */
export interface SegmentSettings {
  segmentId: string;
  speaker: string;
  audio: SegmentAudioSettings;
  content: SegmentContentSettings;
}

/** Voice selection method for a character */
export type VoiceSelectionMethod =
  | "ai-top-pick"     // Used the #1 ranked match
  | "ai-top-3"        // Picked from the top 3 matches
  | "self-selected"   // Browsed the library and chose
  | "custom-created"; // Created via Voice Design API

/** Tracks how a character deviates from AI defaults */
export interface CharacterDeviation {
  name: string;
  /** Fields that differ from AI-generated defaults: key → { default, current } */
  fields: Record<string, { defaultValue: unknown; currentValue: unknown }>;
  voiceSelection: VoiceSelectionMethod;
}

/** Aggregated pattern for one speaker across all their segments */
export interface SpeakerPattern {
  speaker: string;
  segmentCount: number;
  overrideCount: number;
  /** Average deviation from default gap (ms) */
  avgGapDeviation: number;
  /** Average deviation from default LUFS */
  avgLufsDeviation: number;
  /** Human-readable pattern descriptions */
  patterns: string[];
}

/** Full deviation report for the project */
export interface DeviationReport {
  totalSegments: number;
  segmentsWithOverrides: number;
  overridesByOrigin: { analyzed: number; user: number };
  speakerPatterns: SpeakerPattern[];
  characterDeviations: CharacterDeviation[];
}

/** Metadata for rendering a setting as a slider */
export interface SettingMeta {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  category: "timing" | "levels" | "fades";
}
