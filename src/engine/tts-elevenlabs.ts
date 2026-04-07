/**
 * ElevenLabs TTS engine.
 * Fetches voices, matches them to character traits, synthesizes speech.
 */

import type { CharacterProfile, TextSegment } from "../stores/project-store";
import type { GeneratedSegment, GenerationProgress } from "./audio-generator";

const API_BASE = "https://api.elevenlabs.io/v1";
const MODEL_ID = "eleven_v3";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels: Record<string, string>;
  preview_url: string;
}

export interface ElevenLabsVoiceOption {
  id: string;
  label: string;
  voiceId: string;
  voiceName: string;
}

// ── Voice fetching ─────────────────────────────────────────────────────────

export async function fetchVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs voices fetch failed: ${msg}`);
  }
  const data = await res.json();
  return data.voices as ElevenLabsVoice[];
}

// ── Voice matching ─────────────────────────────────────────────────────────

/** Score a voice against character traits by matching label values. */
function scoreVoice(voice: ElevenLabsVoice, traits: string[]): number {
  const labelValues = Object.values(voice.labels).map((v) => v.toLowerCase());
  let score = 0;
  for (const trait of traits) {
    const t = trait.toLowerCase();
    for (const lv of labelValues) {
      if (lv.includes(t) || t.includes(lv)) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

/** Match voices to character traits, return top 3 options. */
export function matchVoiceOptions(
  character: CharacterProfile,
  voices: ElevenLabsVoice[],
): ElevenLabsVoiceOption[] {
  const traits = [
    ...character.voiceTraits,
    character.gender,
    character.age,
    character.origin,
    character.dialect,
  ].filter((t) => t && t !== "unknown" && t !== "none");

  const scored = voices
    .map((v) => ({ voice: v, score: scoreVoice(v, traits) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map((s, i) => ({
    id: `${character.name}-el-${i + 1}`,
    label: `${s.voice.name} (${formatLabels(s.voice.labels)})`,
    voiceId: s.voice.voice_id,
    voiceName: s.voice.name,
  }));
}

function formatLabels(labels: Record<string, string>): string {
  const parts: string[] = [];
  if (labels.gender) parts.push(labels.gender);
  if (labels.age) parts.push(labels.age);
  if (labels.accent) parts.push(labels.accent);
  return parts.join(", ") || "voice";
}

// ── Synthesis ──────────────────────────────────────────────────────────────

interface SynthesizeOptions {
  /** Text from the previous segment (helps model produce natural continuity) */
  previousText?: string;
  /** Text from the next segment */
  nextText?: string;
  /** Higher stability (0.7-0.8) for very short segments to reduce artifacts */
  stability?: number;
}

async function synthesize(
  text: string,
  voiceId: string,
  apiKey: string,
  options?: SynthesizeOptions,
): Promise<Blob> {
  // Ensure clean ending — append trailing [pause] for v3 to produce clean tail
  let processedText = text;
  if (!processedText.endsWith("[pause]")) {
    processedText = processedText.trimEnd() + " [pause]";
  }

  // Normalize trailing punctuation — commas/semicolons at the very end cause artifacts
  processedText = processedText.replace(/[,;]\s*(\[pause\])$/, ". $1");

  // Short segments get higher stability to prevent artifacts
  const stability = options?.stability ?? (text.length < 30 ? 0.7 : 0.5);
  // Lower style = more consistent between segments. Tags handle expressiveness.
  const style = text.length < 30 ? 0 : 0.2;

  const body: Record<string, unknown> = {
    text: processedText,
    model_id: MODEL_ID,
    voice_settings: {
      stability,
      similarity_boost: 0.75,
      style,
      use_speaker_boost: true,
    },
  };

  // Context stitching: only for models that support it (v2, flash — NOT v3)
  if (MODEL_ID !== "eleven_v3") {
    if (options?.previousText) body.previous_text = options.previousText;
    if (options?.nextText) body.next_text = options.nextText;
  }

  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs synthesis failed: ${msg}`);
  }

  return res.blob();
}

// ── Full generation ────────────────────────────────────────────────────────

/** Get audio duration from an MP3 blob using Web Audio API. */
async function getAudioDuration(blob: Blob): Promise<number> {
  const { createAudioContext, safeDecode } = await import("../utils/audio-context");
  const ctx = createAudioContext();
  const buffer = await blob.arrayBuffer();
  const decoded = await safeDecode(ctx, buffer);
  const duration = decoded.duration;
  await ctx.close();
  return duration;
}

export async function generateAllSegments(
  segments: TextSegment[],
  voiceMap: Map<string, string>,
  apiKey: string,
  onProgress: (p: GenerationProgress) => void,
): Promise<GeneratedSegment[]> {
  const results: GeneratedSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress({
      current: i + 1,
      total: segments.length,
      segmentId: seg.id,
      speaker: seg.speaker,
    });

    const voiceId = voiceMap.get(seg.speaker);
    if (!voiceId) throw new Error(`No voice assigned for ${seg.speaker}`);

    const audio = await synthesize(seg.voiceText, voiceId, apiKey);
    const duration = await getAudioDuration(audio);

    results.push({
      segmentId: seg.id,
      speaker: seg.speaker,
      audio,
      duration,
    });
  }

  return results;
}

export function concatenateAudioMp3(generated: GeneratedSegment[]): Blob {
  const parts = generated.map((g) => g.audio);
  return new Blob(parts, { type: "audio/mpeg" });
}
