# Narratu

AI-powered audiobook creator that turns short stories into voiced audiobooks with distinct character voices — entirely in the browser.

_Narratu — Latin for "you narrate."_

**[Try it live](https://jdeworks.github.io/narratu-poc/)**

## What it does

1. Paste a short story (up to ~5k tokens)
2. AI extracts characters, speech directions, and inflection markers
3. Edit voice-optimized text and character voice profiles
4. Generate voiced audio with distinct character voices and narration
5. Play or download the finished audiobook as MP3

## Development

```bash
npm install
npm run dev       # local dev server
npm run tunnel    # dev server accessible via cloudflare tunnel
npm run build     # build to docs/
npm test          # run tests
```

## Lessons Learned — Building an Audiobook Engine with AI

This project was built across 4 Claude Code sessions (~135 commits, April 2026). Below are the hardest problems encountered, including wrong turns, failed attempts, and the fixes that actually worked.

### 1. TTS provider switch — sibilance killed the first choice (~8 iterations)

**Problem:** Started with Hume AI (Octave) for character voices. Audio sounded natural in isolation, but across 63 segments, sibilance (harsh "s" sounds) accumulated and was fatiguing to listen to.

**What was tried:** De-esser filter via Web Audio API BiquadFilter (helped but couldn't fix source audio), brightness/tone controls for per-character tuning, shorter segments to reduce artifacts. None addressed the root cause — Hume's model just produced more sibilant output than competitors.

**Fix:** Switched to ElevenLabs (eleven_v3 model, MOS 4.8). Kept the Hume engine wired in for users who prefer it, but made ElevenLabs the default. The entire demo was regenerated.

**Side effect:** ElevenLabs uses `[audio tags]` for expressiveness instead of Hume's `description` field. This required rewriting the LLM prompt, the segment data model, and the voice text rendering. Two systems, two mental models.

**Takeaway:** Evaluate TTS providers on full-story output, not single-segment demos. Sibilance, inter-segment consistency, and tail behavior only show up at scale. Build the engine provider-agnostic from day one — we did, and the switch was survivable.

### 2. Trailing artifact detection — 5 detection algorithms before it worked

**Problem:** TTS engines produce trailing artifacts: clicks, breaths, phantom phonemes, resonance tails. These are inaudible in isolation but create a "machine gun" effect when segments play back-to-back.

**Attempt 1:** Fixed earlyStopMs per segment (trim last N ms). Too blunt — trimmed real speech on short segments, didn't trim enough on long ones.

**Attempt 2:** RMS-based silence detection on the last 300ms. Missed low-level artifacts that were above the silence threshold but clearly not speech (TTS "room tone").

**Attempt 3:** Dip-then-rise pattern detection (energy drops then rises at the tail). Caught trailing breaths but false-positived on normal speech consonants between syllables. Required minimum 15ms of genuine silence before flagging.

**Attempt 4:** Non-monotonic decay detection (energy should decay monotonically at end of speech — if it rises, that's an artifact). Caught phantom phonemes but needed careful trough positioning to avoid flagging natural speech variation.

**Attempt 5 (final):** Multi-check pipeline combining all four methods, plus end-spike detection (click in last 10ms) and relative silence threshold (90th percentile speech level x 8%). Also added a pre-check that scans the full audio for trailing silence, skipping the last 100ms to avoid masking by end-clicks.

**Then the real fix:** After all that detection work, adding `[pause]` to the end of every ElevenLabs prompt + lowering `style` from 0.5 to 0.2 eliminated 56% of artifacts at the source. The detector went from flagging 16/63 segments to 7/63.

**Takeaway:** Fix artifacts at the source (prompt engineering, model settings) before building complex detection. But keep the detector — TTS models are non-deterministic, and artifacts will always appear in some generations. Defense in depth: prompt fixes + detection + configurable earlyStop + fade-out curves.

### 3. Sample rate mismatch — the "weird sounds" that weren't encoding bugs

**Problem:** MP3 export produced audio with distorted pitch and wrong speed. Sounded like everything was playing through a broken filter.

**Wrong hypothesis:** Suspected the `@breezystack/lamejs` MP3 encoder was buggy, or that the `Int8Array` → `Uint8Array.from()` conversion was flipping byte signs. Wrote 6 tests proving the encoder worked perfectly at both 44100 and 48000 Hz.

**Root cause:** `mixer-export.ts` hardcoded `const sampleRate = 44100`, but `new AudioContext().decodeAudioData()` decodes at the system's sample rate (48000 Hz on most modern hardware). So 48000 Hz PCM was written into a 44100 Hz buffer and encoded as 44100 Hz MP3 — playing ~9% slower with lower pitch.

**Fix:** One line: `const sampleRate = audioCtx.sampleRate`.

**Bonus bug found:** The voiceline export (`exportAudiobook`) ignored per-segment settings entirely — it used `DEFAULT_CONFIG` with `earlyStopMs: 0`, so all the carefully tuned tail trimming and fades were thrown away on export. Fixed by reading from the segment-settings store.

**Takeaway:** When audio sounds "weird," check sample rates before debugging encoding. And when two code paths do the same thing (mixer export vs voiceline export), they need the same settings source — copy-paste of the processing logic without the settings wiring is a guaranteed divergence bug.

### 4. Volume systems — three rewrites from "too loud" to "barely there"

**Problem:** Background music drowned out speech. Users couldn't hear the story.

**Iteration 1:** LLM suggested volumes of 15-60% for music. Way too loud — music should be atmospheric texture, not foreground.

**Iteration 2:** Added a 2.5x gain boost in the playback engine to compensate for Web Audio API volume perception. Now the mixer showed "5%" but the actual output was 12.5%. Sidebar preview had a different boost factor. Export used yet another gain path. Three different volume systems, none matching.

**Iteration 3 (final):** Removed all gain boosts. Volume values are direct linear gain: 3% music = 0.03 gain. Slider max capped at 20%. LLM prompt updated to suggest 2-5% for music, 3-8% for SFX. One system, one truth.

**Takeaway:** Resist the urge to add compensation multipliers. If the raw values seem wrong, fix the range and defaults — don't add a hidden multiplier that future code has to know about. "Volume 5% but actually 12.5%" is a bug that will bite every new code path.

### 5. The DemoPage — four complete rewrites in one session

**Iteration 1:** Simple audio player with play/pause per segment. Functional but didn't showcase the product's capabilities.

**Iteration 2:** Editor-style layout with segment rows, character badges, emotion/inflection icons. Better, but the per-segment view didn't convey "this is an audiobook."

**Iteration 3:** Added the full audio mixer (4-track timeline with waveforms, zoom, drag, crossfade). The demo now shows the mixing capabilities, but the page was 675 LOC and growing.

**Iteration 4:** Extracted components aggressively (DemoSegmentRow, StoryTextModal, SegmentSettingsPanel, DeviationReport). DemoPage went from 675 → 292 LOC. The mixer auto-loads and auto-places regions so the demo works without user interaction.

**Takeaway:** Demo pages evolve faster than feature pages because they serve a different audience (investors, not users). Accept that rewrites are part of the process — but extract components early so each rewrite touches fewer files.

### 6. Dead code across sessions — the Hume graveyard

**Problem:** After switching from Hume to ElevenLabs, Hume-specific code persisted across 3 sessions: a 120-voice data file, preview/synthesis functions, `"HUME_AI"` provider strings hardcoded in components that now only showed ElevenLabs voices.

**Why it persisted:** Each session focused on new features, not cleanup. The Hume code didn't break anything — it was just dead weight. The `PresetVoice` type lived in `hume-voices.ts` but was actually generic, used by ElevenLabs components. Renaming it felt risky mid-feature.

**Fix (session 4):** Moved `PresetVoice` to `types/voices.ts` with generic `provider: string`. Deleted the 120-voice data file. Removed dead exports from both TTS engines. Fixed misleading provider strings. Added orphaned `Header.tsx` deletion. Total: -356 lines.

**Takeaway:** Dead code from provider switches accumulates silently because it doesn't cause errors. Schedule explicit cleanup sessions. When you switch providers, grep for the old provider name across the entire codebase — string literals like `"HUME_AI"` are invisible to import analysis.

### 7. Settings architecture — the three-tier merge that saved the UI

**Problem:** Audio segments need per-segment settings (loudness, fades, gap timing). Some should be auto-detected (tail artifacts), some rule-based (gap duration by speaker transition), some user-edited. The UI needs to show where each value came from.

**Naive approach:** Just store the final value. Lost provenance — users couldn't tell if a value was auto-detected, AI-suggested, or manually set.

**Solution:** Three-tier `TrackedValue` system: `{ value, origin: "default" | "analyzed" | "user", defaultValue }`. Each setting has a reset button that returns to the analyzed or default value. Origin badges in the UI show provenance at a glance. The segment-analyzer runs on load and populates the "analyzed" tier; user edits override to "user" tier.

**Side effect:** The settings store became the single source of truth for both the mixer timeline (visual positions, waveform rendering) and the export pipeline (actual audio processing). Bidirectional binding: dragging a segment in the mixer updates `gapBeforeMs` in the settings store, which updates the settings panel, which updates the export.

**Takeaway:** For any system where values come from multiple sources (auto-detection, AI, user), track provenance alongside the value. It costs almost nothing in data size but saves enormous UI complexity — "why is this value 50ms?" is answered by the origin badge.

### 8. LLM prompt engineering for audio — calculations vs. anchors

**Early mistake:** Asked the LLM to output precise millisecond values for SFX timing ("play door creak at 14,350ms"). The LLM hallucinated numbers that were nowhere near the actual audio positions.

**Fix:** LLM provides word-level anchors ("play door creak at word 'creaked'"), and code resolves words to millisecond positions using the actual segment audio durations. The LLM is good at understanding narrative structure ("the creak happens when she opens the door"); code is good at math.

**Also applied to:** Music placement (LLM says "start piano at segment 5, end at segment 12" — code computes the actual ms range), gap duration (LLM provides speaker transition context — code computes ms from trailing silence measurements).

**Takeaway:** Use LLMs for semantic understanding (what happens where in the story), never for numerical precision. The boundary is: LLM provides anchors and qualitative guidance, code does all arithmetic.

## License

[Business Source License 1.1](LICENSE.md) — see LICENSE.md for details.
