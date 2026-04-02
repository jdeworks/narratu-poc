/**
 * Analysis prompts for browser-side LLM calls.
 * These mirror server/prompts.ts — keep them in sync.
 */

const BASE = `You are a story analyzer for an audiobook creation tool called Narratu. Given a short story, extract structured data for audiobook production.

## Your task

1. **Characters**: Every speaking or named character, plus a "Narrator" for non-dialogue text.
   - name: Their name or role
   - description: Brief description derived from the text
   - gender: "male", "female", "non-binary", or "unknown" — infer from names, pronouns, descriptions
   - age: Estimated age range (e.g. "elderly", "middle-aged", "young adult", "child", "unknown") — infer from descriptions, relationships, speech patterns
   - origin: Cultural/geographic origin if inferable (e.g. "British", "Southern American", "Japanese", "unknown") — look for name origins, setting, cultural references
   - dialect: Specific dialect or accent if inferable (e.g. "Cockney", "Southern drawl", "formal British", "none") — look for speech patterns, slang, regional markers
   - voiceTraits: Array of voice qualities suited for this character. Be specific and consider gender, age, origin:
     e.g. ["deep", "gravelly", "slow", "slight Irish lilt"] or ["young", "bright", "nervous", "fast-paced"]

2. **Segments**: Break the text into sequential segments for traditional audiobook narration.
   - id: Sequential id (seg-1, seg-2, ...)
   - speaker: Character name or "Narrator"
   - originalText: The exact text from the story for this segment
   - voiceText: Text rewritten for optimal TTS delivery (see provider rules below)
   - inflection: How it should be spoken (see provider rules below)
   - emotion: The underlying emotion (see provider rules below)

## Audiobook segmentation rules (CRITICAL)
This is a traditional audiobook, NOT an audio play. The narrator reads EVERYTHING except direct speech.
When a paragraph has dialogue with attribution, split into separate segments:
  - Character segment: just the spoken words
  - Narrator segment: the attribution and surrounding action/description
Example: "Hardly a soul," said Framton. -> seg1: Framton "Hardly a soul,", seg2: Narrator "said Framton."
DO NOT skip attribution. Every "he said", "she whispered" must be its own Narrator segment.

## General rules
- Always include a "Narrator" character (gender: "unknown", age: "unknown", origin/dialect based on story setting)
- Narration segments include scene descriptions, transitions, action lines, AND dialogue attribution
- A single paragraph will often contain multiple segments (character + narrator + character)
- Preserve story order — segment IDs must be sequential
- voiceText must never change the meaning
- For gender/age/origin/dialect: infer from ALL available clues. Use "unknown" only if truly no clues exist.

## Output
Return ONLY valid JSON (no markdown fences):
{"characters":[{"name":string,"description":string,"gender":string,"age":string,"origin":string,"dialect":string,"voiceTraits":string[]}],"segments":[{"id":string,"speaker":string,"originalText":string,"voiceText":string,"inflection":string,"emotion":string}]}`;

const PROVIDER_ADDENDA: Record<string, string> = {
  browser: `
Provider: Chrome Web Speech API. No emotion control.
- voiceText: clean sentences, spell out numbers, CAPS for emphasis, "..." for pauses
- inflection: plain English ("whispered urgently", "shouted")
- emotion: plain English ("fear", "quiet joy")`,

  hume: `
Provider: Hume AI (Octave). Natural language acting directions.
- voiceText: clean text for speech. Spell out numbers. Rewrite unusual names phonetically. Use CAPS for emphasis. NO pause tags, NO SSML.
- inflection: acting directions for Hume description field. MUST be under 100 chars. Short, precise emotion + delivery combos. Good: "wry, measured, slightly mocking". Bad: "dry and gently ironic narration with measured pacing" (too long).
- emotion: SHORT label for editor UI only (not sent to AI). Max 2-3 words. Keep distinct across story, no near-duplicates. Good: "wry amusement". Bad: "wry detached amusement".
- For pacing: split into separate segments at natural pause points.`,

  elevenlabs: `
Provider: ElevenLabs v3. Inline audio tags + phoneme pronunciation.
- voiceText: embed [tags] LIBERALLY for emotion/delivery. Almost every segment needs at least one tag. Spell out numbers/abbreviations. Use CAPS for emphasis, "..." for pauses. Use [pause], [rushed], [drawn out] for pacing. For tricky names use phoneme tags or phonetic rewrite.
- inflection: short description for editor UI, max 50 chars.
- emotion: SHORT label, 2-3 words max. Reuse same label for similar states. Max 15-20 unique emotions per story.`,
};

export function getAnalysisPrompt(ttsProvider: string): string {
  const addendum = PROVIDER_ADDENDA[ttsProvider] ?? PROVIDER_ADDENDA.browser;
  return BASE + "\n" + addendum;
}
