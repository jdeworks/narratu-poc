/**
 * Maps word anchors from LLM mixing analysis to millisecond offsets.
 * The LLM provides exact word quotes; we find them in voiceText
 * and map character position to time using duration proportion.
 */

/**
 * Resolve a word anchor to a millisecond offset within a segment.
 *
 * @param atWords - Exact phrase from voiceText to anchor to
 * @param timing - "start" (begin of phrase), "middle", "end" (after phrase)
 * @param voiceText - The full voiceText of the segment
 * @param segmentOffsetMs - When this segment starts on the timeline
 * @param segmentDurationMs - Total duration of this segment's audio
 * @returns Absolute ms position on the timeline, or null if anchor not found
 */
export function resolveWordAnchor(
  atWords: string,
  timing: "start" | "middle" | "end",
  voiceText: string,
  segmentOffsetMs: number,
  segmentDurationMs: number,
): number | null {
  if (!atWords || !voiceText || segmentDurationMs <= 0) return null;

  // Strip TTS tags from voiceText for matching
  const cleanText = voiceText.replace(/\[.*?\]/g, "").trim();
  const cleanAnchor = atWords.replace(/\[.*?\]/g, "").trim();

  // Find the anchor phrase (case-insensitive)
  const idx = cleanText.toLowerCase().indexOf(cleanAnchor.toLowerCase());
  if (idx < 0) {
    // Try fuzzy: match first 10 chars
    const shortAnchor = cleanAnchor.slice(0, 10).toLowerCase();
    const fuzzyIdx = cleanText.toLowerCase().indexOf(shortAnchor);
    if (fuzzyIdx < 0) return null;
    return computeOffset(fuzzyIdx, shortAnchor.length, cleanText.length, timing, segmentOffsetMs, segmentDurationMs);
  }

  return computeOffset(idx, cleanAnchor.length, cleanText.length, timing, segmentOffsetMs, segmentDurationMs);
}

function computeOffset(
  charIdx: number,
  anchorLen: number,
  totalChars: number,
  timing: "start" | "middle" | "end",
  segOffsetMs: number,
  segDurationMs: number,
): number {
  let charPos: number;
  if (timing === "start") charPos = charIdx;
  else if (timing === "middle") charPos = charIdx + anchorLen / 2;
  else charPos = charIdx + anchorLen;

  const fraction = Math.min(1, Math.max(0, charPos / totalChars));
  return segOffsetMs + fraction * segDurationMs;
}
