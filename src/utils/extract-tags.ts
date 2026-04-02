/**
 * Extract audio tags from voiceText (e.g., [sarcastic], [pause], [hushed]).
 * These are the actual delivery instructions sent to ElevenLabs v3.
 */

/** Extract all [tag] strings from voiceText */
export function extractTags(voiceText: string): string[] {
  const matches = voiceText.match(/\[([^\]]+)\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1)); // remove brackets
}

/** Get a display-friendly summary of tags (e.g., "sarcastic, rushed") */
export function tagSummary(voiceText: string): string {
  const tags = extractTags(voiceText);
  // Filter out pacing tags that aren't interesting as metadata
  const display = tags.filter((t) => t !== "pause" && t !== "long pause");
  return display.join(", ");
}

/** Get the voiceText with tags stripped (the raw speech content) */
export function stripTags(voiceText: string): string {
  return voiceText.replace(/\[[^\]]+\]\s*/g, "").trim();
}
