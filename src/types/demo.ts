import type { CharacterProfile, TextSegment, EnrichmentData, VoiceMatches } from "../stores/project-store";
import type { MixingAnalysis } from "../engine/analyze-mixing";

export interface DemoVoiceProfile {
  characterName: string;
  voiceId: string;
  voiceName: string;
  sampleFile: string;
  sampleFileV2?: string;
  provider?: string;
}

export interface DemoAudioSegment {
  segmentId: string;
  file: string;
  duration: number;
}

export interface DemoManifest {
  id: string;
  title: string;
  description: string;
  story: {
    text: string;
    characters: CharacterProfile[];
    segments: TextSegment[];
  };
  voiceProfiles: DemoVoiceProfile[];
  audioSegments: DemoAudioSegment[];
  fullAudioFile: string;
  fullDuration: number;
  generatedWith: string;
  enrichment?: EnrichmentData;
  voiceMatches?: VoiceMatches;
  demoSelections?: Record<string, { voiceId: string; voiceName: string; source: string }>;
  sampleTexts?: Record<string, string>;
  mixingAnalysis?: MixingAnalysis;
  generatedSounds?: Record<string, { file: string; durationSec: number }>;
  /** Pre-computed audio optimizations (earlyStopMs, etc.) keyed by segment ID */
  audioOptimizations?: Record<string, Partial<Record<string, number>>>;
}

function getBase(): string {
  // Vite injects BASE_URL at build time; fallback for tests
  try {
    // @ts-expect-error -- Vite-specific, not in tsconfig types
    return (import.meta.env?.BASE_URL ?? "/") + "demo/";
  } catch {
    return "/demo/";
  }
}

export async function loadDemoManifest(): Promise<DemoManifest> {
  const base = getBase();
  const res = await fetch(base + "manifest.json");
  if (!res.ok) throw new Error("Demo manifest not found");
  return res.json();
}

export function demoAssetUrl(relativePath: string): string {
  return getBase() + relativePath;
}
