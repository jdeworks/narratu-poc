/**
 * Hume AI Octave TTS engine.
 * Uses the Octave API for emotionally-aware voice synthesis.
 * Voices are specified by name from Hume's Voice Library (provider: HUME_AI).
 */

import type { CharacterProfile, TextSegment } from "../stores/project-store";
import type { GeneratedSegment, GenerationProgress } from "./audio-generator";

const API_BASE = "https://api.hume.ai/v0/tts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface HumeVoice {
  id: string;
  name: string;
  provider: "HUME_AI" | "CUSTOM_VOICE";
}

interface HumeVoiceOption {
  id: string;
  label: string;
  voiceName: string;
  voiceId: string;
}

interface TtsResponse {
  generations: Array<{
    generation_id: string;
    audio: string; // base64
    duration: number;
  }>;
}

// ── Voice fetching ─────────────────────────────────────────────────────────

export async function fetchVoices(apiKey: string): Promise<HumeVoice[]> {
  const res = await fetch(`${API_BASE}/voices?provider=HUME_AI&page_size=100`, {
    headers: { "X-Hume-Api-Key": apiKey },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Hume voices fetch failed: ${msg}`);
  }
  const data = await res.json();
  return (data.voices_page ?? data.voices ?? data) as HumeVoice[];
}

// ── Voice matching ─────────────────────────────────────────────────────────

/** Build voice options for a character from available Hume voices. */
export function matchVoiceOptions(
  character: CharacterProfile,
  voices: HumeVoice[],
): HumeVoiceOption[] {
  // Simple name-based matching: return first 3 available voices
  // Hume voices are curated so any voice works well with acting directions
  const options = voices.slice(0, 3);
  return options.map((v, i) => ({
    id: `${character.name}-hume-${i + 1}`,
    label: v.name,
    voiceName: v.name,
    voiceId: v.id,
  }));
}

// ── Synthesis ──────────────────────────────────────────────────────────────

/** Synthesize speech using Hume Octave. Returns MP3 audio blob. */
async function synthesize(
  text: string,
  voiceName: string,
  actingDirection: string,
  apiKey: string,
  trailingSilence = 0,
): Promise<{ blob: Blob; duration: number }> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "X-Hume-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      utterances: [
        {
          text,
          voice: { name: voiceName, provider: "HUME_AI" },
          description: actingDirection.slice(0, 100),
          speed: 1.0,
          trailing_silence: trailingSilence,
        },
      ],
      format: { type: "mp3" },
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Hume synthesis failed: ${msg}`);
  }

  const data: TtsResponse = await res.json();
  const gen = data.generations[0];
  const binary = Uint8Array.from(atob(gen.audio), (c) => c.charCodeAt(0));
  return {
    blob: new Blob([binary], { type: "audio/mpeg" }),
    duration: gen.duration,
  };
}

// ── Full generation ────────────────────────────────────────────────────────

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

    const voiceName = voiceMap.get(seg.speaker);
    if (!voiceName) throw new Error(`No voice assigned for ${seg.speaker}`);

    const { blob, duration } = await synthesize(
      seg.voiceText,
      voiceName,
      seg.inflection,
      apiKey,
      seg.trailingSilence ?? 0,
    );

    results.push({
      segmentId: seg.id,
      speaker: seg.speaker,
      audio: blob,
      duration,
    });
  }

  return results;
}

export function concatenateAudioMp3(generated: GeneratedSegment[]): Blob {
  const parts = generated.map((g) => g.audio);
  return new Blob(parts, { type: "audio/mpeg" });
}
