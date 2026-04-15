# Narratu

AI-powered audiobook creator that turns short stories into voiced audiobooks with distinct character voices — entirely in the browser.

_Narratu — Latin for "you narrate."_

**[Try the live demo](https://jdeworks.github.io/narratu-poc/)**

## What Narratu Does

Narratu transforms written stories into fully voiced audiobooks using AI. Each character gets a unique voice matched to their personality, and the entire production pipeline — from text analysis to final audio export — runs client-side in the browser.

### Key Capabilities

- **AI Story Analysis** — Extracts characters, dialogue, emotions, and speech directions from raw text using LLM analysis
- **Automatic Voice Matching** — Scores and ranks voices from a library of 500+ options against each character's profile (age, gender, accent, personality)
- **Unique Voice Per Character** — Every character gets a distinct AI voice; the narrator, the protagonist, and the villain all sound different
- **4-Track Audio Mixer** — Timeline editor with speaker, noise, music, and SFX tracks; waveform visualization, zoom, and per-segment controls
- **AI-Optimized Audio Settings** — Per-segment gap timing, LUFS normalization, fade curves, and trailing artifact detection, all auto-tuned by AI analysis
- **Background Music & Sound Effects** — AI-suggested atmospheric audio placed at narrative-appropriate moments
- **MP3 Export** — Voiceline-only or full audiobook export with all mixer settings applied
- **BYOK (Bring Your Own Key)** — In production mode, users provide their own API keys for full control over costs and provider choice. The demo includes pre-generated audio — no API key needed to explore
- **Character Relationship Diagrams** — Auto-generated Mermaid flowcharts showing character connections and relationship types

### Demo: "The Open Window" by Saki

The live demo includes a complete audiobook of Saki's "The Open Window" with:
- 63 voiced segments across 7 distinct AI characters
- Pre-computed voice matches ranked by character fit
- AI-optimized audio settings (gap timing, normalization, fades)
- Background music and sound effects auto-placed on the mixer timeline
- Full export capability — [listen to the voiceline export](demo/)

## For Investors

Narratu demonstrates a viable path to an AI audiobook production tool that:

1. **Lightweight architecture** — The PoC runs entirely client-side as a static site. The production tool will use a server for orchestration, but the heavy lifting (TTS, LLM) is offloaded to third-party APIs — keeping infrastructure costs low and scaling simple.

2. **Solves a real production bottleneck** — Professional audiobook production costs $2,000–$10,000+ per title. Narratu targets 95% automation: AI handles analysis, voice matching, mixing, and optimization. Users confirm and fine-tune.

3. **Differentiates on voice quality** — Every character gets a unique, AI-matched voice. This isn't text-to-speech with one narrator; it's a cast of distinct voices with personality-appropriate matching.

4. **Has a clear expansion path:**
   - **Audiobook mode** (current) — Narrator reads all text including dialogue attribution
   - **Audio play mode** (planned) — Direct speech only, no narrator, with sound effects — like a radio drama
   - **Voice cloning** (planned) — Clone your own voice or a specific actor's voice for any character
   - **Batch production** (planned) — Process entire book catalogs with consistent quality

5. **Built for iteration** — The three-tier settings system (default → AI-optimized → user override) means every decision is visible and reversible. Users can trust the AI defaults or fine-tune anything.

See the [For Investors page](https://jdeworks.github.io/narratu-poc/#investors) in the live demo for more detail. (Navigate via the sidebar: Pages → For Investors)

## Lessons Learned — Building an Audiobook Engine with AI

This project was built across 4 Claude Code sessions (~135 commits, April 2026). Below are the hardest problems encountered, including wrong turns, failed attempts, and the fixes that actually worked.

### 1. TTS provider switch — sibilance killed the first choice (~8 iterations)

**Problem:** Started with Hume AI (Octave) for character voices. Audio sounded natural in isolation, but across 63 segments, sibilance (harsh "s" sounds) accumulated and was fatiguing to listen to.

**What was tried:** De-esser filter via Web Audio API BiquadFilter (helped but couldn't fix source audio), brightness/tone controls for per-character tuning, shorter segments to reduce artifacts. None addressed the root cause — Hume's model just produced more sibilant output than competitors.

**Fix:** Switched to ElevenLabs (eleven_v3 model, MOS 4.8). Kept the Hume engine wired in for users who prefer it, but made ElevenLabs the default. The entire demo was regenerated.

**Takeaway:** Evaluate TTS providers on full-story output, not single-segment demos. Sibilance, inter-segment consistency, and tail behavior only show up at scale. Build the engine provider-agnostic from day one.

### 2. Trailing artifact detection — 5 detection algorithms before it worked

**Problem:** TTS engines produce trailing artifacts: clicks, breaths, phantom phonemes, resonance tails. These are inaudible in isolation but create a "machine gun" effect when segments play back-to-back.

**Attempts 1-4:** Fixed earlyStopMs (too blunt), RMS silence detection (missed low-level artifacts), dip-then-rise patterns (false positives on consonants), non-monotonic decay detection (needed careful tuning).

**Attempt 5 (final):** Multi-check pipeline combining all methods, plus end-spike detection and relative silence thresholds.

**Then the real fix:** Adding `[pause]` to the end of every ElevenLabs prompt + lowering `style` from 0.5 to 0.2 eliminated 56% of artifacts at the source. The detector went from flagging 16/63 segments to 7/63.

**Takeaway:** Fix artifacts at the source (prompt engineering, model settings) before building complex detection. But keep the detector — TTS models are non-deterministic. Defense in depth: prompt fixes + detection + configurable earlyStop + fade-out curves.

### 3. Sample rate mismatch — the "weird sounds" that weren't encoding bugs

**Problem:** MP3 export produced audio with distorted pitch and wrong speed.

**Wrong hypothesis:** Suspected the MP3 encoder was buggy. Wrote 6 tests proving it worked perfectly.

**Root cause:** `mixer-export.ts` hardcoded `sampleRate = 44100`, but `AudioContext.decodeAudioData()` decodes at the system's sample rate (48000 Hz on most modern hardware). 48000 Hz PCM encoded as 44100 Hz MP3 — playing ~9% slower with lower pitch.

**Fix:** One line: `const sampleRate = audioCtx.sampleRate`.

**Takeaway:** When audio sounds "weird," check sample rates before debugging encoding.

### 4. Volume systems — three rewrites from "too loud" to "barely there"

**Problem:** Background music drowned out speech. Three different volume systems (mixer, sidebar, export) each applied different gain boosts.

**Final fix:** Removed all gain boosts. Volume values are direct linear gain: 3% music = 0.03 gain. Slider max capped at 20%. One system, one truth.

**Takeaway:** Resist hidden multipliers. If raw values seem wrong, fix the range and defaults — don't add a compensation layer that every new code path must know about.

### 5. Settings architecture — the three-tier merge

**Problem:** Audio segments need per-segment settings from multiple sources (auto-detected, AI-suggested, user-edited). The UI needs to show where each value came from.

**Solution:** Three-tier `TrackedValue` system: `{ value, origin: "default" | "analyzed" | "user", defaultValue }`. Origin badges in the UI show provenance at a glance. The settings store is the single source of truth for both the mixer timeline and the export pipeline.

**Takeaway:** For any system where values come from multiple sources, track provenance alongside the value. It costs almost nothing but saves enormous UI complexity.

### 6. LLM prompt engineering for audio — calculations vs. anchors

**Early mistake:** Asked the LLM to output precise millisecond values for SFX timing. The LLM hallucinated numbers nowhere near actual audio positions.

**Fix:** LLM provides word-level anchors ("play door creak at word 'creaked'"), code resolves words to millisecond positions using actual segment durations. LLM handles semantic understanding; code handles arithmetic.

**Takeaway:** Use LLMs for semantic understanding (what happens where), never for numerical precision.

## License

[Business Source License 1.1](LICENSE.md) — see LICENSE.md for details.
