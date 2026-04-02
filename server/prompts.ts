/**
 * Base system prompt — shared across all providers.
 * Provider-specific addenda are appended by getAnalysisPrompt().
 */
const BASE_SYSTEM_PROMPT = `You are a story analyzer for an audiobook creation tool called Narratu. Given a short story, you must extract structured data for audiobook production.

## Your task

1. **Characters**: Every speaking or named character, plus a "Narrator" for non-dialogue text.
   - name: Their name or role (e.g. "Narrator", "Old Man", "Sarah")
   - description: Brief description derived from the text (appearance, personality, age clues)
   - gender: "male", "female", "non-binary", or "unknown" — infer from names, pronouns, descriptions
   - age: Estimated age range (e.g. "elderly", "middle-aged", "young adult", "child", "unknown") — infer from descriptions, relationships, speech patterns
   - origin: Cultural/geographic origin if inferable (e.g. "British", "Southern American", "Japanese", "unknown") — look for name origins, setting, cultural references
   - dialect: Specific dialect or accent if inferable (e.g. "Cockney", "Southern drawl", "formal British", "none") — look for speech patterns, slang, regional markers
   - voiceTraits: Array of voice qualities suited for this character. Be specific and consider gender, age, origin:
     e.g. ["deep", "gravelly", "slow", "slight Irish lilt"] or ["young", "bright", "nervous", "fast-paced"]

2. **Segments**: Break the story into sequential segments for traditional audiobook narration.
   - id: Sequential id (seg-1, seg-2, ...)
   - speaker: Character name or "Narrator"
   - originalText: The exact text from the story for this segment
   - voiceText: The text rewritten for optimal TTS delivery (see provider-specific rules below)
   - inflection: How this segment should be spoken (see provider-specific format below)
   - emotion: The underlying emotion (see provider-specific format below)

## Audiobook segmentation rules (CRITICAL)

This is a traditional audiobook, NOT an audio play. The narrator reads EVERYTHING except direct speech.

When a paragraph contains dialogue with attribution, split it into separate segments:
  - Character segment: just the spoken words
  - Narrator segment: the attribution and any surrounding action/description

Example input: "My aunt will be down presently, Mr. Nuttel," said a very self-possessed young lady of fifteen; "in the meantime you must try and put up with me."

This becomes THREE segments:
  1. speaker: "Vera", voiceText: "My aunt will be down presently, Mister Nuttel."
  2. speaker: "Narrator", voiceText: "said a very self-possessed young lady of fifteen."
  3. speaker: "Vera", voiceText: "in the meantime you must try and put up with me."

Another example: "Hardly a soul," said Framton. "My sister was staying here..."

This becomes THREE segments:
  1. speaker: "Framton", voiceText: "Hardly a soul."
  2. speaker: "Narrator", voiceText: "said Framton."
  3. speaker: "Framton", voiceText: "My sister was staying here..."

DO NOT skip or merge attribution into the character's speech. Every "he said", "she whispered", "asked Framton" must be its own Narrator segment. This is what makes it an audiobook rather than an audio play.

**CRITICAL: voiceText segment endings**
- Every voiceText MUST end with sentence-final punctuation: . ? ! or ...
- NEVER end with a trailing comma or semicolon — this causes TTS artifacts (clicks, phantom breaths)
- When splitting dialogue mid-sentence, change the trailing comma to a period in voiceText
  (the originalText preserves the actual punctuation, voiceText is optimized for TTS)

**Segment length limits (CRITICAL for TTS quality)**
- MAX 3-4 sentences per segment. Long TTS requests produce inconsistent pacing and artifacts.
- If a character speaks more than 4 sentences, split into multiple segments of the SAME speaker.
  Each sub-segment should be a natural thought unit (don't break mid-sentence).
- Narrator passages over 3 sentences MUST be split at natural paragraph or thought boundaries.
- Very long monologues (like a character telling a story) should be 2-3 sentences per segment.

## General rules

- Always include a "Narrator" character (gender: "unknown", age: "unknown", origin/dialect based on story setting)
- Narration segments include scene descriptions, transitions, action lines, AND dialogue attribution
- A single paragraph will often contain multiple segments (character + narrator + character)
- Preserve the exact story order — segment IDs must be sequential
- voiceText must never change the meaning, only optimize for spoken delivery
- For gender/age/origin/dialect: infer from ALL available clues (names, pronouns, descriptions, relationships like "father"/"daughter", speech patterns, story setting). Use "unknown" only if truly no clues exist.

## Output format

Return ONLY valid JSON (no markdown fences, no explanation) matching this schema:
{
  "characters": [{ "name": string, "description": string, "gender": string, "age": string, "origin": string, "dialect": string, "voiceTraits": string[] }],
  "segments": [{ "id": string, "speaker": string, "originalText": string, "voiceText": string, "inflection": string, "emotion": string }]
}`;

/**
 * Chrome Web Speech API — the free dev/demo option.
 * Very limited control: only rate, pitch, and voice selection.
 * voiceText should be as clean and readable as possible.
 * inflection/emotion are metadata for the editor UI only — Chrome can't use them.
 */
const CHROME_ADDENDUM = `

## Provider: Chrome Web Speech API (browser-native, limited control)

Chrome TTS has NO emotion or inflection control. It only supports rate and pitch.
Your job is still to extract rich inflection/emotion metadata for the editor UI,
but optimize voiceText for the simplest possible spoken delivery:

**voiceText rules:**
- Remove all attribution ("he said", "she whispered")
- Expand contractions for clarity ("don't" → "do not" where it sounds better)
- Use ellipses "..." for pauses (Chrome respects punctuation timing)
- Use CAPS sparingly for emphasis words (Chrome slightly emphasizes capitalized words)
- Spell out numbers ("3" → "three") and abbreviations ("Dr." → "Doctor")
- Keep sentences short — Chrome handles short sentences better than long complex ones

**inflection field:** Use plain English descriptions for the editor UI.
Examples: "whispered urgently", "shouted with anger", "calm and reflective"

**emotion field:** Use plain English.
Examples: "fear", "quiet joy", "bitter resignation", "shocked disbelief"`;

/**
 * Hume AI (Octave) — natural language acting directions.
 * The description field accepts free-form acting instructions.
 * This is the most expressive provider.
 */
const HUME_ADDENDUM = `

## Provider: Hume AI (Octave TTS)

Hume uses a natural-language \`description\` field for acting directions.
This is the most expressive TTS provider — be creative and specific.

**voiceText rules:**
- Remove all attribution ("he said", "she whispered")
- Clean text optimized for speech. Spell out numbers.
- Rewrite unusual names phonetically if needed (e.g. Nguyen -> "Win")
- Use CAPS for emphasis on key words
- NO pause tags like [pause] or [long pause] — Hume does not support them
- NO SSML tags of any kind
- For pacing/pauses: split into separate segments at natural pause points rather than embedding tags

**inflection field:** This maps directly to Hume's \`description\` parameter (acting directions for the TTS).
MUST be under 100 characters. Use short, precise emotion + delivery combos. No filler words.
Good: "wry, measured, slightly mocking"
Good: "frightened, rushed, breathless"
Good: "warm, conspiratorial whisper"
Bad: "dry and gently ironic narration with measured and unhurried pacing" (too long, too vague)

**emotion field:** A SHORT label for the editor UI (not sent to AI). Max 2-3 words.
This is for humans to scan at a glance, not for the TTS engine.
Good: "wry amusement", "quiet dread", "nervous guilt"
Bad: "wry detached amusement" (too wordy)
Bad: "quiet ironic amusement" (overlaps with similar labels)
IMPORTANT: Keep emotions distinct across the story. Do not create near-duplicates like "neutral observation" and "neutral recollection". Use ONE label for similar states.`;

/**
 * ElevenLabs (v3) — audio tags inline in text.
 * The primary control mechanism is [tags] embedded in the text.
 * Voice settings (stability, style) provide additional tuning.
 */
const ELEVENLABS_ADDENDUM = `

## Provider: ElevenLabs (Eleven v3)

ElevenLabs v3 uses inline audio tags for emotion/delivery control, placed directly in voiceText.
This is the highest quality TTS provider. Use its full capabilities.

**voiceText rules:**
- Spell out numbers ("3" → "three"), abbreviations ("Mr." → "Mister", "Dr." → "Doctor")
- Embed audio tags at the START of a segment or inline where needed
- Use "..." for pauses and weight ("I saw... everything.")
- Use CAPS sparingly for strong emphasis on KEY words only
- For unusual names/words, use phoneme tags for pronunciation:
  CMU Arpabet: <phoneme alphabet="cmu-arpabet" ph="W IH1 N">Nguyen</phoneme>
  IPA: <phoneme alphabet="ipa" ph="wiːn">Nguyen</phoneme>
  Or simpler: rewrite phonetically ("Nguyen" → "Win")

**Segment ending rules (CRITICAL — prevents audio artifacts):**
- Every voiceText MUST end with sentence-final punctuation: period, question mark, or exclamation mark
- NEVER end voiceText with a trailing comma or semicolon — this signals "more is coming" to the TTS
  model, causing it to produce continuation breaths, phantom phonemes, or clicks at the tail
- If the original text ends mid-sentence with a comma, REWRITE the ending to sound complete:
  BAD:  "My aunt will be down presently, Mister Nuttel,"
  GOOD: "My aunt will be down presently, Mister Nuttel."
  BAD:  "said Framton;"
  GOOD: "said Framton."
- Short attribution segments (under 5 words like "said Framton.") are high-risk for artifacts.
  Whenever possible, merge them into the adjacent narrator segment.

**Available audio tags (embed in voiceText — USE THEM LIBERALLY):**
Delivery: [whispers], [sighs], [exhales], [sarcastic], [curious], [excited], [crying],
  [laughs], [laughs harder], [starts laughing], [wheezing], [snorts], [mischievously]
Pacing: [pause], [long pause], [rushed], [drawn out], [slows down], [stammers]
Tone: [matter-of-fact], [hushed], [tense], [weary], [calm], [deliberate], [measured],
  [pedantic], [self-important], [playfully], [chanting]
Combinable: [nervously][whispers], [happily][shouts], [hushed][slows down]

USE TAGS GENEROUSLY but SPECIFICALLY. Almost every segment should have at least one tag.
- Narrator segments use tone + pacing tags ([measured], [hushed], [tense], [pause])
- Character segments use emotion tags plus pacing
- AVOID overusing [drawn out] — it creates sameness. Use specific tags instead:
  [deliberate], [measured], [hushed], [slows down], [matter-of-fact]
- For singing/chanting text, use [chanting] or [playfully] — NOT [drawn out]
- For dramatic reveals, use [hushed] + [slows down] rather than just [drawn out]
- For dry wit or punchlines, use [matter-of-fact] with an ellipsis pause

**Examples of good voiceText:**
- "[whispers] I know what you did... I saw EVERYTHING."
- "[sighs] Another day... another disappointment."
- "[excited] You're NEVER going to believe what happened!"
- "[hushed] [slows down] The old keeper knelt slowly... searching, steady."
- "[sarcastic] Oh sure, because THAT went so well last time."
- "[matter-of-fact] Romance at short notice... was her speciality."
- "[chanting] [playfully] I said... Bertie, why do you bound?"
- "[tense] Framton shivered slightly [pause] and turned towards the niece."

**inflection field:** Short human-readable description for editor UI. Max 50 chars.
Good: "whispered, tense", "dry narration, wry"
Bad: "speaking in a whispered and tense manner with underlying fear" (too long)

**emotion field:** SHORT label for editor UI only (not sent to TTS). Max 2-3 words.
IMPORTANT: Reuse the SAME label for similar emotional states. Aim for MAX 15-20 unique emotions per story.
Good: "wry amusement", "quiet dread", "cool deception"
Bad: having 55 unique emotions when 15 would cover it. "comic distance" and "dry wit" should be the SAME label.`;

const PROVIDER_ADDENDA: Record<string, string> = {
  browser: CHROME_ADDENDUM,
  hume: HUME_ADDENDUM,
  elevenlabs: ELEVENLABS_ADDENDUM,
};

export function getAnalysisPrompt(provider: string): string {
  const addendum = PROVIDER_ADDENDA[provider] ?? CHROME_ADDENDUM;
  return BASE_SYSTEM_PROMPT + addendum;
}

// Default export for backwards compat
export const ANALYSIS_SYSTEM_PROMPT = getAnalysisPrompt("browser");

// ── Pass 2: Enrichment prompt (relationships + voice profiles) ──────────

export const ENRICHMENT_SYSTEM_PROMPT = `You are a story enrichment engine for an audiobook tool called Narratu.
You receive character profiles and sample dialogue from a story that was already analyzed in a first pass.
Your job is to produce TWO things:

## 1. Character relationship diagram (Mermaid)

Create a Mermaid flowchart that maps ALL character relationships.
Use the "graph LR" direction (left-to-right).

Rules:
- Every character gets a node. Use their name as the node ID (no spaces — use underscores).
- Edges are labeled with the relationship: family, friend, employer, romantic, acquaintance, antagonist, etc.
- Use different arrow styles to convey relationship type:
  - Family/blood: thick arrows \`==>\` with label
  - Social/acquaintance: normal arrows \`-->\` with label
  - Conflict/tension: dotted arrows \`-.->\` with label
- Add a CSS class per character for styling. Assign each character a class.
- The Narrator character should NOT appear in the diagram.
- For stories with many characters (10+), focus on characters with speaking roles and named characters.
  Background/unnamed NPCs can be omitted.
- Keep edge labels SHORT (1-3 words): "niece", "husband", "nervous visitor", "hunting companion"

Example output:
\`\`\`mermaid
graph LR
  Mrs_Sappleton["Mrs. Sappleton"]
  Vera["Vera"]
  Framton["Framton Nuttel"]
  Mrs_Sappleton ==>|niece| Vera
  Framton -->|visitor| Mrs_Sappleton
  Vera -.->|deceives| Framton
\`\`\`

## 2. Voice profile strings

For EACH character (including Narrator), produce a short voice description string optimized for the ElevenLabs Voice Design API.

Rules:
- MUST be 20-200 characters. Be concise but specific.
- Start with the physical voice type: age + gender + accent.
- Then add 2-3 key vocal qualities that distinguish this character.
- Do NOT reference character names, plot details, or relationships — only describe the VOICE itself.
- Do NOT mention age numbers (say "young woman" not "15-year-old girl") to avoid content filters.
- These strings are sent directly to a voice generation API, so they must describe a voice, not a character.

Good examples:
- "A young British woman with a clear, composed voice. Precise diction, subtle mischievous undertone, self-assured."
- "Middle-aged British man, warm baritone. Hearty and relaxed, with an outdoorsy energy."
- "Elderly British woman, bright and chatty. Cheerful, sociable, slightly distracted."

Bad examples:
- "Vera, the niece who tricks Framton" (describes character, not voice)
- "A 15-year-old girl" (age number triggers safety filters)
- "deep gravelly mysterious dark brooding intense" (keyword soup, not a description)

## Output format

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "mermaid": "graph LR\\n  ...",
  "voiceProfiles": {
    "CharacterName": "voice description string",
    "Narrator": "voice description string"
  }
}`;

export function buildEnrichmentUserPrompt(
  characters: { name: string; description: string; gender: string; age: string; origin: string; dialect: string; voiceTraits: string[] }[],
  sampleSegments: { speaker: string; voiceText: string }[],
): string {
  const charBlock = characters
    .filter((c) => c.name !== "Narrator")
    .map((c) => {
      const traits = c.voiceTraits?.length ? c.voiceTraits.join(", ") : "none";
      return `- ${c.name}: ${c.description} (${c.gender}, ${c.age}, ${c.origin}/${c.dialect}, traits: ${traits})`;
    })
    .join("\n");

  const narratorChar = characters.find((c) => c.name === "Narrator");
  const narratorLine = narratorChar
    ? `- Narrator: ${narratorChar.description} (${narratorChar.origin}/${narratorChar.dialect}, traits: ${narratorChar.voiceTraits?.join(", ") || "none"})`
    : "- Narrator: Story narrator";

  const segBlock = sampleSegments
    .map((s) => `[${s.speaker}] ${s.voiceText.slice(0, 200)}`)
    .join("\n");

  return `Characters:\n${charBlock}\n${narratorLine}\n\nSample dialogue (for relationship inference):\n${segBlock}\n\nGenerate the Mermaid relationship diagram and voice profile strings. Return ONLY JSON.`;
}

// ── Mixing Analysis Prompt (Pass 3) ─────────────────────────────────────

export const MIXING_ANALYSIS_PROMPT = `You are a professional audio mixing engineer and sound designer for audiobook production. You analyze story segments to suggest background music and sound effects that create an immersive listening experience.

## Input
You receive the full story broken into segments, each with:
- id: Unique segment identifier (e.g. "seg-1")
- speaker: Character name or "Narrator"
- voiceText: The exact text that will be spoken (with TTS tags — ignore tags like [whispers], [pause] when quoting)
- emotion: The emotional tone of delivery
- inflection: How the line is delivered

## Your task
Suggest background MUSIC and SOUND EFFECTS. Follow the 20% rule: audio enhancements should cover ~20% of the audiobook, targeting KEY moments for maximum impact. Not every segment needs sound.

### Music rules
- Music plays underneath speech at VERY low volume (0.02-0.05) — barely perceptible background texture. Values are direct gain (0.03 = 3% of full volume).
- Music is generated as a SHORT SEAMLESS LOOP (15-22 seconds) that repeats to fill the placement duration
  Set \`durationSec\` to 15-22 (the loop length). NOT the full placement duration.

#### Music prompt format (CRITICAL — follows ElevenLabs best practices)
- Keep prompts 15-25 words. Front-load the most important descriptor.
- ALWAYS end with "seamless loop"
- Include: primary instrument, secondary texture, tempo BPM, key/mood descriptor
- Use audio terminology: "pad", "drone", "arpeggios", "staccato", "legato", "underscore"
- For under-speech music, include "soft", "subtle", "gentle", "background" — this genuinely reduces output dynamics
- Good: "Soft piano arpeggios with warm string pad, 68 BPM, contemplative, minor key, seamless loop"
- Bad: "A beautiful piece of piano music that sounds gentle and warm with some strings playing softly in the background creating a contemplative mood" (too long, too vague)

- Use \`placements[]\` array — same music piece can play at MULTIPLE positions (generate once, place many)
- Each placement references start and end segment IDs
- Target ~4-8 music pieces for a short story. Every part should have SOME music.
  Types: opening, scene transition, tension, dialogue underscore, ambient bed, closing
- Include fadeInMs (1000-3000) and fadeOutMs (2000-5000) — longer fades sound more natural
- Music MUST be continuous with NO gaps — consecutive pieces crossfade automatically.
  The engine overlaps regions by the fade duration, so endSegment of one piece should be
  the segment just before startSegment of the next piece. Cover the ENTIRE story.
- Adjacent music pieces should have compatible moods for smooth crossfades (e.g., don't
  follow a gentle ambient pad with an intense staccato piece — transition gradually).

### Sound effects rules
- SFX volume should be subtle (0.08-0.15) — sound effects support the narration, they don't steal focus. Values are direct gain (0.10 = 10%).
- SFX overlay speech on a separate track — they play SIMULTANEOUSLY with the voice
- Anchor SFX to EXACT words from voiceText using \`atWords\` — quote the EXACT phrase as it appears
  DO NOT calculate times or ms offsets. Just quote words. Our code maps words to timestamps.
- \`timing\`: "start" (SFX begins as narrator starts the phrase), "middle" (peaks during), "end" (starts after phrase)

#### SFX prompt format (CRITICAL — follows ElevenLabs best practices)
- Keep prompts 8-20 words. Shorter is better for SFX. Front-load the sound source.
- Include 3-4 of: source, material, environment, intensity. No more.
- For Foley/impacts (1-5s): be precise. "Heavy oak door closing firmly, quiet hallway"
- For ambience (8-15s): include "soft", "gentle", "subtle" to lower dynamics.
  "Gentle October breeze through open window, quiet country house"
- Use audio terms: "Foley", "one-shot", "ambience", "room tone"
- Good: "Porcelain teacup on saucer, gentle, quiet drawing room"
- Bad: "The sound of a teacup being carefully placed down on a saucer in a quiet Victorian drawing room with ambient sounds" (too long)

- Group similar effects: if "window" appears 5 times, create ONE sfx with first occurrence anchor
- Duration: 1-5s for Foley/impacts, 8-15s for ambience. Match to the sound type.
- "Tense silence" IS valid: "Room tone, distant clock, uncomfortable quiet"

### Quality guidelines
- Aim for placements that need minimal user adjustment
- NOT every segment needs sound — silence and bare speech are powerful
- Follow the story arc: build atmosphere gradually, peak at climax, resolve at end
- SFX at narrative peaks: action moments, emotional reveals, scene transitions
- Never overwhelm the listener — if in doubt, leave it out
- Consider what the LISTENER imagines: help them hear the world, don't overexplain it

## Output format
Return ONLY valid JSON:
\`\`\`json
{
  "music": [
    {
      "id": "music-1",
      "title": "Short descriptive name",
      "prompt": "Detailed ElevenLabs generation prompt with instruments, mood, tempo, style",
      "mood": "2-3 word mood label",
      "placements": [
        { "startSegment": "seg-1", "endSegment": "seg-5" }
      ],
      "volume": 0.03,
      "durationSec": 18,
      "fadeInMs": 2000,
      "fadeOutMs": 3000
    }
  ],
  "sfx": [
    {
      "id": "sfx-1",
      "title": "Short name",
      "prompt": "Detailed ElevenLabs SFX generation prompt, specific and vivid",
      "atWords": "exact quote from voiceText",
      "segmentId": "seg-24",
      "timing": "start",
      "volume": 0.10,
      "durationSec": 3
    }
  ]
}
\`\`\`
`;

export function buildMixingUserPrompt(
  segments: { id: string; speaker: string; voiceText: string; emotion: string; inflection: string }[],
  characters: { name: string; description: string }[],
): string {
  const charBlock = characters.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  const segBlock = segments.map((s) =>
    `[${s.id}] ${s.speaker} (${s.emotion}, ${s.inflection}): ${s.voiceText.slice(0, 150)}${s.voiceText.length > 150 ? "..." : ""}`,
  ).join("\n");

  return `Characters:\n${charBlock}\n\nSegments (${segments.length} total):\n${segBlock}\n\nAnalyze this audiobook and suggest music and sound effects. Return ONLY JSON.`;
}
