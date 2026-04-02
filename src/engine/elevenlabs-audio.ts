/**
 * ElevenLabs Sound Effects and Music generation via dev-api proxy.
 *
 * Prompt guidelines (from research):
 * - 10-30 words sweet spot. Specific but concise.
 * - Include: source, material, environment, intensity
 * - prompt_influence: 0.7-1.0 for Foley, 0.3-0.5 for ambience/music
 * - loop: true for ambient beds and music (v2 model only)
 * - duration: 1-5s Foley, 10-22s ambience, 15-22s music loops
 */

const API_BASE = "http://localhost:4001";

/**
 * Generate a sound effect (Foley, impact, short ambient).
 * High prompt_influence for precise results.
 */
export async function generateSFX(
  prompt: string,
  durationSec?: number,
  options?: { loop?: boolean; promptInfluence?: number },
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/elevenlabs/sfx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: prompt,
      ...(durationSec ? { duration_seconds: durationSec } : {}),
      prompt_influence: options?.promptInfluence ?? 0.7,
      ...(options?.loop ? { loop: true } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `SFX generation failed: ${res.status}`);
  }

  return res.blob();
}

/**
 * Generate a seamless music loop for background underscore.
 * Lower prompt_influence for musical polish, loop=true for seamless repeat.
 */
export async function generateMusic(
  prompt: string,
  durationSec = 18,
): Promise<Blob> {
  return generateSFX(
    prompt,
    Math.min(durationSec, 22),
    { loop: true, promptInfluence: 0.4 },
  );
}
