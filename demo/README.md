# Narratu Demo Exports

Exported audio from the Narratu PoC demo — "The Open Window" by Saki (H.H. Munro), public domain.

## Available Exports

### Voiceline Export

**[poc-export-the-open-window-voiceline.mp3](poc-export-the-open-window-voiceline.mp3)**

Voices-only export: 63 AI-voiced segments with 7 distinct character voices, including gap timing, LUFS normalization, and fade curves. No background music or sound effects.

This is exported from the PoC demo page using the "Export Voiceline" option. It applies the AI-optimized per-segment audio settings (gap timing, early stop, fade in/out) but does not include the full optimization pipeline available in the production tool.

**What's included:**
- All 63 voiced segments concatenated in story order
- Per-segment gap timing (AI-computed based on speaker transitions)
- LUFS normalization for consistent loudness across characters
- Fade in/out curves per segment
- Trailing artifact trimming (earlyStop)

**What's not included (PoC limitation):**
- Background music and sound effects (available in the full audiobook export)
- Advanced master bus processing
- Cross-fade between segments

### Full Audiobook Export

_Coming soon_ — The full audiobook export includes all mixer tracks (voices + music + SFX) with volume automation, loop regions, and fade envelopes applied. This will be added once the export pipeline is verified on the deployed demo.

### Fully Optimized Version

_Coming soon_ — The production tool includes additional optimization passes:
- Master bus EQ and compression
- Per-character voice EQ profiles
- Intelligent cross-fading between segments
- Dynamic range optimization for different listening environments (car, headphones, speakers)
- Batch normalization across the full audiobook

## How These Were Generated

All audio was generated using the [Narratu PoC](https://jdeworks.github.io/narratu-poc/):

1. Story text analyzed by Claude (Anthropic) to extract characters, emotions, and speech directions
2. Voices matched from ElevenLabs shared library (eleven_v3 model) — scored and ranked against each character's profile
3. Audio generated with per-segment inflection tags and expression control
4. Settings auto-optimized by AI analysis (gap timing, normalization, fades, artifact trimming)
5. Exported via the demo page's export function

No manual audio editing was performed. All settings are AI-optimized defaults from the demo.

## License

Audio content generated from public domain source text. The Narratu tool is licensed under [Business Source License 1.1](../LICENSE.md).
