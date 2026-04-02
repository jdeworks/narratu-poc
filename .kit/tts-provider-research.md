# TTS Provider Research for Audiobook Generation

**Date:** 2026-04-02
**Purpose:** Evaluate Hume AI, Cartesia, and ElevenLabs for an audiobook creation tool requiring distinct character voices with emotional inflection.

---

## Table of Contents

1. [Hume AI (Octave TTS)](#1-hume-ai-octave-tts)
2. [Cartesia (Sonic)](#2-cartesia-sonic)
3. [ElevenLabs](#3-elevenlabs)
4. [Comparison Matrix](#4-comparison-matrix)
5. [Recommendations for Audiobook Use](#5-recommendations-for-audiobook-use)

---

## 1. Hume AI (Octave TTS)

**Website:** https://www.hume.ai/
**Docs:** https://dev.hume.ai/docs/text-to-speech-tts/overview

### Voice Selection & Cloning

Hume offers two approaches to voice specification:

**By ID** (custom or library voices):

```json
{
  "voice": {
    "id": "9e068547-5ba4-4c8e-8e03-69282a008f04"
  }
}
```

**By Name** (with provider qualifier):

```json
{
  "voice": {
    "name": "Male English Actor",
    "provider": "HUME_AI"
  }
}
```

**Voice Design via Prompt:** You can create a voice from a natural-language description without any audio sample. The API generates candidates and you save the one you like:

```python
result = await hume.tts.synthesize_json(
    utterances=[PostedUtterance(
        description="Crisp, upper-class British accent with impeccably articulated consonants.",
        text="The science of speech. That's my profession; also my hobby."
    )],
    num_generations=2,
)
# Save the best generation as a reusable voice
await hume.tts.voices.create(
    name="british-butler",
    generation_id=result.generations[0].generation_id,
)
```

**Voice Cloning:** Requires as little as 15 seconds of audio. Available in both Octave 1 and Octave 2.

**Voice stickiness:** Set voice on the first utterance; it carries forward for subsequent utterances unless overridden. This is convenient for multi-utterance audiobook chapters.

### Emotional Inflection & Speech Directions

Hume's core differentiator is its emotion-aware LLM backbone. The model automatically reads semantic/emotional context from the text and adjusts pronunciation, pitch, tempo, and emphasis.

**Acting Instructions** (Octave 1 only, coming to Octave 2): Use the `description` field on each utterance with natural-language directions:

```python
PostedUtterance(
    text="Let us begin by taking a deep breath in.",
    description="calm, pedagogical",
    speed=0.65,
    trailing_silence=4,
    voice=voice
)
```

Controllable aspects via `description`:

- Emotional tone: "melancholy", "excited but whispering", "nervous laughter"
- Delivery style: "whispering", "shouting", "rushed", "measured"
- Performance context: "speaking to a crowd", "intimate conversation"

**Best practice:** Keep descriptions under 100 characters. Use specific emotions ("melancholy" vs. "sad"). Combine approaches: "excited but whispering."

### Speed / Pacing Control

- **`speed`** parameter: Range `0.5` (half speed) to `2.0` (double speed), default `1.0`
- **`trailing_silence`** parameter: Seconds of silence after an utterance (useful for paragraph/chapter breaks)
- **In-text markup:** `[pause]` and `[long pause]` can be inserted directly in text

### Special Markup / Notation

Hume uses a minimal, proprietary markup system:

- `[pause]` -- short pause within text
- `[long pause]` -- longer pause within text
- No SSML support

The `description` field is the primary control mechanism rather than inline markup.

### API Endpoints

| Endpoint               | Method    | Purpose                                                    |
| ---------------------- | --------- | ---------------------------------------------------------- |
| `/v0/tts`              | POST      | Synchronous, returns JSON with base64 audio                |
| `/v0/tts/file`         | POST      | Synchronous, returns downloadable audio file               |
| `/v0/tts/stream/json`  | POST      | Streaming, emits JSON objects with base64 audio + metadata |
| `/v0/tts/stream/file`  | POST      | Streaming, raw audio bytes (MP3, WAV, PCM)                 |
| `/v0/tts/stream/input` | WebSocket | Bidirectional -- send text incrementally, receive audio    |

**SDKs:** Python, TypeScript, .NET, CLI tool

**Python quickstart:**

```python
from hume import AsyncHumeClient
from hume.tts import PostedUtterance, PostedUtteranceVoiceWithName

hume = AsyncHumeClient(api_key="YOUR_API_KEY")

stream = hume.tts.synthesize_json_streaming(
    utterances=[
        PostedUtterance(
            text="It was a dark and stormy night.",
            description="ominous, slow",
            speed=0.8,
            voice=PostedUtteranceVoiceWithName(name='Ava Song', provider='HUME_AI')
        )
    ],
    strip_headers=True,
    version="2"
)
```

**TypeScript quickstart:**

```typescript
import { HumeClient } from "hume";

const hume = new HumeClient({ apiKey: process.env.HUME_API_KEY! });

const stream = await hume.tts.synthesizeJsonStreaming({
  utterances: [
    {
      text: "It was a dark and stormy night.",
      description: "ominous, slow",
      speed: 0.8,
      voice: { name: "Ava Song", provider: "HUME_AI" as const },
    },
  ],
  stripHeaders: true,
  version: "2",
});
```

### Pricing

| Plan       | Monthly Cost | Included Characters      | Overage per 1K chars |
| ---------- | ------------ | ------------------------ | -------------------- |
| Free       | $0           | 10,000 (~10 min)         | N/A                  |
| Starter    | $3           | 30,000 (~30 min)         | N/A                  |
| Creator    | $14          | 140,000 (~140 min)       | $0.15                |
| Pro        | $70          | 1,000,000 (~1,000 min)   | $0.12                |
| Scale      | $200         | 3,300,000 (~3,300 min)   | $0.10                |
| Business   | $500         | 10,000,000 (~10,000 min) | $0.05                |
| Enterprise | Custom       | Custom                   | Custom               |

RPM limits range from 15 (Free/Starter) to 225 (Business).

### Browser / Client-Side Compatibility

- The TypeScript SDK currently targets Node.js. Direct WebSocket support in the browser SDK is described as "coming soon."
- REST endpoints can technically be called from a browser, but exposing the API key client-side is a security concern. A backend proxy is recommended.
- Audio output formats (MP3, WAV, PCM) are all browser-playable.

### Limitations & Gotchas

- **Acting instructions (`description`) are Octave 1 only.** Octave 2 support is listed as "coming soon." This is the most important feature for audiobook character work.
- Max 5,000 characters per utterance.
- Max 1,000 characters per `description`.
- Max 5 generations per request.
- Octave 2 voices only work with Octave 2 requests (version incompatibility).
- Instant mode (default) requires a predefined voice and `num_generations` of 1.
- Latency: ~200ms (Octave 1), ~100ms (Octave 2).

---

## 2. Cartesia (Sonic)

**Website:** https://cartesia.ai/
**Docs:** https://docs.cartesia.ai/

### Voice Selection & Cloning

Voices are specified by ID in a voice object:

```python
voice = {
    "mode": "id",
    "id": "e07c00bc-4134-4eae-9ea4-1a55fb45746b"
}
```

**Voice library categories:**

- **Stable, realistic voices** (e.g., Katie, Kiefer) -- recommended for narration
- **Emotive voices** (e.g., Tessa, Kyle) -- recommended for character-driven/expressive work

**Instant Voice Cloning:** Available on Pro plan and above (1 credit per character of cloned speech).
**Pro Voice Cloning:** Available on Startup plan and above (1M credits to train; 1.5 credits per character for generation).

### Emotional Inflection & Speech Directions

Cartesia provides explicit emotion control via the `generation_config.emotion` parameter. The API accepts a wide range of named emotions:

**Primary emotions:** `neutral`, `calm`, `angry`, `content`, `sad`, `scared`

**Extended emotions (50+):** `happy`, `excited`, `enthusiastic`, `elated`, `euphoric`, `triumphant`, `amazed`, `surprised`, `flirtatious`, `curious`, `peaceful`, `serene`, `grateful`, `affectionate`, `trust`, `sympathetic`, `anticipation`, `mysterious`, `mad`, `outraged`, `frustrated`, `agitated`, `threatened`, `disgusted`, `contempt`, `envious`, `sarcastic`, `ironic`, `dejected`, `melancholic`, `disappointed`, `hurt`, `guilty`, `bored`, `tired`, `rejected`, `nostalgic`, `wistful`, `apologetic`, `hesitant`, `insecure`, `confused`, `resigned`, `anxious`, `panicked`, `alarmed`, `proud`, `confident`, `distant`, `skeptical`, `contemplative`, `determined`

```python
response = client.tts.generate(
    model_id="sonic-3",
    transcript="I can't believe you actually did it!",
    voice={"mode": "id", "id": "voice-id"},
    output_format={"container": "wav", "encoding": "pcm_f32le", "sample_rate": 44100},
    generation_config={
        "emotion": "excited",
        "speed": 1.1,
        "volume": 1.0
    }
)
```

**Laughter:** Inline `[laughter]` tags can be placed in the transcript text.

### Speed / Pacing Control

- **`generation_config.speed`**: Range `0.6` to `1.5`, default `1.0`
- **`generation_config.volume`**: Range `0.5` to `2.0`, default `1.0`
- The deprecated top-level `speed` parameter still works but `generation_config.speed` is preferred.

### Special Markup / Notation

- **`[laughter]`** tag inline in transcript text
- **SSML tags** are referenced in the docs as supported for volume, speed, and emotion control (though the detailed SSML reference pages were inaccessible at time of research). The model docs mention "fine-grained control on volume, speed, and emotion through API parameters and SSML tags."
- **Pronunciation dictionaries** supported via `pronunciation_dict_id` parameter (Sonic 3+).

### API Endpoints

| Endpoint          | Method | Purpose                                        |
| ----------------- | ------ | ---------------------------------------------- |
| `POST /tts/bytes` | POST   | Synchronous, returns audio bytes (WAV/MP3/RAW) |
| `POST /tts/sse`   | POST   | Server-Sent Events streaming                   |
| WebSocket         | WS     | Bidirectional streaming for real-time use      |

**Authentication:** API Key or Bearer JWT token. Requires `Cartesia-Version` header (e.g., `2026-03-01`).

**SDKs:** Python (`pip install cartesia`), JavaScript/TypeScript (`npm install @cartesia/cartesia-js`)

**Python example:**

```python
import os
from cartesia import Cartesia

client = Cartesia(api_key=os.getenv("CARTESIA_API_KEY"))

response = client.tts.generate(
    model_id="sonic-3",
    output_format={
        "container": "wav",
        "encoding": "pcm_f32le",
        "sample_rate": 44100,
    },
    transcript="She looked at him with a mixture of hope and dread.",
    voice={"mode": "id", "id": "e07c00bc-4134-4eae-9ea4-1a55fb45746b"},
    generation_config={
        "emotion": "anxious",
        "speed": 0.9,
        "volume": 0.8
    }
)
response.write_to_file("output.wav")
```

**WebSocket streaming (Python):**

```python
with client.tts.websocket_connect() as connection:
    ctx = connection.context(
        model_id="sonic-3",
        voice={"mode": "id", "id": "voice-id"},
        output_format={"container": "raw", "encoding": "pcm_f32le", "sample_rate": 44100},
    )
    for part in ["The road ", "goes ever ", "on and ", "on."]:
        ctx.push(part)
    ctx.no_more_inputs()
    for response in ctx.receive():
        if response.type == "chunk" and response.audio:
            # process audio chunk
            pass
```

**TypeScript example:**

```typescript
import Cartesia from "@cartesia/cartesia-js";

const client = new Cartesia({ token: process.env.CARTESIA_API_KEY });

const response = await client.tts.generate({
  model_id: "sonic-3",
  output_format: {
    container: "wav",
    encoding: "pcm_f32le",
    sample_rate: 44100,
  },
  transcript: "She looked at him with a mixture of hope and dread.",
  voice: { mode: "id", id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b" },
});
const audio = await response.blob();
```

### Pricing

| Plan       | Monthly Cost     | Credits Included | Key Features                          |
| ---------- | ---------------- | ---------------- | ------------------------------------- |
| Free       | $0               | 20K              | Personal use only                     |
| Pro        | $4/mo (annual)   | 100K             | Instant voice cloning, commercial use |
| Startup    | $39/mo (annual)  | 1.25M            | Pro voice cloning, org support        |
| Scale      | $239/mo (annual) | 8M               | Priority support, high concurrency    |
| Enterprise | Custom           | Custom           | Slack support, enterprise security    |

**Credit costs:** 1 credit per character for standard TTS. Pro voice cloning costs 1M credits to train + 1.5 credits/char for generation.

### Browser / Client-Side Compatibility

- The JavaScript SDK (`@cartesia/cartesia-js`) works in browser environments.
- WebSocket streaming can be used client-side for real-time playback.
- API key exposure is a concern; a backend proxy is recommended for production.

### Limitations & Gotchas

- Speed range is narrower than competitors: only `0.6` to `1.5` (vs. Hume's `0.5`-`2.0`).
- SSML documentation pages returned 404s during this research -- the feature may be partially documented or in flux.
- Emotion is a single-value enum, not a free-text description like Hume. You cannot say "excited but whispering" -- you pick one emotion keyword.
- No acting instructions or free-form delivery direction.
- `[laughter]` is the only confirmed inline tag.
- The `Cartesia-Version` header is required on every request and must match a supported version string.
- Latency is excellent: 90ms (Sonic 3), 40ms (Sonic Turbo).
- 42 languages supported.

---

## 3. ElevenLabs

**Website:** https://elevenlabs.io/
**Docs:** https://elevenlabs.io/docs

### Voice Selection & Cloning

**Voice selection:** Voices are referenced by `voice_id` in the URL path:

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

A searchable voice library is available via `client.voices.search()`.

**Voice Design from Text Prompt:** Create voices from a text description (no audio needed):

```python
# Generate preview candidates
previews = client.voice_design.generate_previews(
    model_id="eleven_multilingual_ttv_v2",
    voice_description="An old American male voice with a slight hoarseness",
    text="Sample text to preview the voice."
)
# Save the selected voice
voice = client.voices.create(
    name="Old Narrator",
    generated_voice_id=previews[0].generated_voice_id
)
```

**Instant Voice Cloning (IVC):**

- Requires 1-3 minutes of clean audio (sweet spot: 1-2 min)
- Audio should be MP3 at 128+ kbps, -23 to -18 dB RMS
- Consistent tone/pace across samples is critical
- The AI mimics everything it hears: speed, inflection, accent, breathing

```python
voice = elevenlabs.voices.ivc.create(
    name="Alex",
    description="An old American male voice with a slight hoarseness",
    files=["./sample_0.mp3", "./sample_1.mp3", "./sample_2.mp3"],
)
```

**Professional Voice Cloning (PVC):** Higher quality but requires more samples and processing time. Note: PVC is not fully optimized for Eleven v3 yet; IVC or designed voices work better with v3.

### Emotional Inflection & Speech Directions

ElevenLabs uses multiple complementary mechanisms:

**1. Voice Settings (per-request):**

| Setting             | Range     | Effect                                              |
| ------------------- | --------- | --------------------------------------------------- |
| `stability`         | 0.0 - 1.0 | Lower = more emotional variation; higher = monotone |
| `similarity_boost`  | 0.0 - 1.0 | How closely to match original voice                 |
| `style`             | 0.0+      | Style exaggeration (increases latency)              |
| `use_speaker_boost` | bool      | Enhance speaker similarity                          |

For expressive character work, use lower `stability` (e.g., 0.3) and moderate `style`.

**2. Narrative Context / Dialogue Tags:** The model reads surrounding text for emotional cues:

```
"You're leaving?" she asked, her voice trembling with sadness.
```

**3. Audio Tags (Eleven v3 -- the primary control method for the latest model):**

Voice/emotion tags:

- `[laughs]`, `[laughs harder]`, `[starts laughing]`, `[wheezing]`
- `[whispers]`
- `[sighs]`, `[exhales]`
- `[sarcastic]`, `[curious]`, `[excited]`, `[crying]`
- `[snorts]`, `[mischievously]`

Sound effect tags:

- `[gunshot]`, `[applause]`, `[clapping]`, `[explosion]`
- `[swallows]`, `[gulps]`

Experimental tags:

- `[strong X accent]` (replace X with desired accent)
- `[sings]`

**4. Stability Slider (v3):**

- **Creative:** Most emotional/expressive but prone to hallucinations
- **Natural:** Balanced, closest to original recording
- **Robust:** Highly stable but less responsive to audio tags

**5. Punctuation effects (v3):**

- Ellipses (...) add pauses and weight
- CAPITALIZATION increases emphasis
- Example: `"It was a VERY long day [sigh] ... nobody listens anymore."`

### Speed / Pacing Control

- **`speed`** parameter in `voice_settings`: Default `1.0`. Recommended range `0.7` to `1.2`. Extreme values degrade quality.
- Natural pacing via text structure: ellipses, dashes, and narrative-style writing.

### Special Markup / Notation

**SSML (v2 and earlier models only):**

- `<break time="1.5s" />` -- pauses up to 3 seconds
- `<phoneme alphabet="cmu-arpabet" ph="M AE1 D IH0 S AH0 N">Madison</phoneme>` -- pronunciation control
- Phoneme tags only work with "Eleven Flash v2" and "Eleven English v1"

**Important: Eleven v3 does NOT support SSML break tags.** Use audio tags, punctuation, and text structure instead.

**Pronunciation Dictionaries:** Upload TXT or PLS files with custom pronunciations. Case-sensitive matching. Up to 3 dictionaries per request.

**Alias tags (for models without phoneme support):**

```xml
<lexeme>
  <grapheme>Claughton</grapheme>
  <alias>Cloffton</alias>
</lexeme>
```

### API Endpoints

| Endpoint                                               | Method | Purpose                      |
| ------------------------------------------------------ | ------ | ---------------------------- |
| `/v1/text-to-speech/{voice_id}`                        | POST   | Synchronous TTS              |
| `/v1/text-to-speech/{voice_id}/with-timestamps`        | POST   | Synchronous + timing data    |
| `/v1/text-to-speech/{voice_id}/stream`                 | POST   | Streaming audio              |
| `/v1/text-to-speech/{voice_id}/stream/with-timestamps` | POST   | Streaming + timing           |
| WebSocket                                              | WS     | Real-time bidirectional      |
| Multi-Context WebSocket                                | WS     | Multiple concurrent contexts |

**Authentication:** `xi-api-key` header.

**SDKs:** Python (`pip install elevenlabs`), TypeScript/JavaScript, Go, Ruby, Java, PHP, C#, Swift

**Python example:**

```python
from elevenlabs.client import ElevenLabs
from elevenlabs.play import play

client = ElevenLabs(api_key="YOUR_API_KEY")

audio = client.text_to_speech.convert(
    text='"You\'re leaving?" she asked, her voice trembling. [sighs]',
    voice_id="JBFqnCBsd6RMkjVDRZzb",
    model_id="eleven_v3",
    output_format="mp3_44100_128",
    voice_settings={
        "stability": 0.3,
        "similarity_boost": 0.75,
        "style": 0.2,
        "speed": 0.9
    }
)
play(audio)
```

**Streaming example:**

```python
from elevenlabs import stream as play_stream

audio_stream = client.text_to_speech.stream(
    text="A long passage of text for the audiobook chapter...",
    voice_id="JBFqnCBsd6RMkjVDRZzb",
    model_id="eleven_v3",
)
play_stream(audio_stream)
```

**Request stitching for long-form content:** Use `previous_request_ids` and `next_request_ids` (up to 3 each) plus `previous_text` / `next_text` to maintain continuity across chunks.

### Pricing

ElevenLabs pricing is character-based. The exact current plan details were not fully accessible during this research, but the known structure is:

- **Free tier:** Limited characters/month, API access included
- **Starter:** ~$5/mo with ~30K characters
- **Creator:** ~$22/mo with ~100K characters
- **Pro:** ~$99/mo with ~500K characters
- **Scale:** ~$330/mo with ~2M characters
- **Enterprise:** Custom

**Models vary in cost:** Eleven Flash v2.5 is 50% cheaper than standard models. Eleven v3 pricing should be verified on the current pricing page.

**28 output formats** supported (MP3, Opus, PCM, WAV, ulaw, alaw at various sample rates/bitrates).

### Browser / Client-Side Compatibility

- The JavaScript SDK works in browser environments.
- WebSocket streaming is browser-compatible for real-time playback.
- REST endpoints can be called from the browser.
- API key exposure concern applies; use a backend proxy for production.
- `optimize_streaming_latency` parameter (0-4) available for tuning.

### Limitations & Gotchas

- **Eleven v3 does NOT support SSML.** This is a significant shift. Audio tags (`[whispers]`, `[laughs]`, etc.) replace SSML in v3.
- Audio tags' effectiveness depends heavily on the voice chosen. A whispery voice will not convincingly shout.
- Professional Voice Clones are not fully optimized for v3 yet. Use IVC or designed voices with v3.
- Speed range is narrow: `0.7` to `1.2` before quality degrades.
- `style` parameter increases latency when non-zero.
- Phoneme tags only work with Flash v2 and English v1 models.
- Multiple SSML break tags (in v2) can cause instability, speed-ups, or artifacts.
- `enable_logging` defaults to `true` -- set to `false` for privacy (enterprise only).

---

## 4. Comparison Matrix

| Feature                         | Hume AI (Octave)                     | Cartesia (Sonic)                            | ElevenLabs                                                                     |
| ------------------------------- | ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------ |
| **Emotion control method**      | Natural language `description` field | Enum-based `emotion` parameter (50+ values) | Audio tags `[whispers]`, `[laughs]`, voice settings sliders, narrative context |
| **Free-form acting direction**  | Yes (description field, Octave 1)    | No (enum only)                              | Partial (audio tags + narrative context)                                       |
| **Voice cloning minimum**       | 15 seconds                           | Not confirmed (likely similar)              | 1-3 minutes                                                                    |
| **Voice design from text**      | Yes                                  | Not confirmed                               | Yes                                                                            |
| **Speed range**                 | 0.5 - 2.0                            | 0.6 - 1.5                                   | 0.7 - 1.2                                                                      |
| **SSML support**                | No                                   | Partial/unclear                             | v2 only (not v3)                                                               |
| **Inline markup**               | `[pause]`, `[long pause]`            | `[laughter]`                                | `[whispers]`, `[laughs]`, `[sighs]`, 15+ tags                                  |
| **Latency**                     | ~200ms (v1), ~100ms (v2)             | 90ms (Sonic 3), 40ms (Turbo)                | Varies by model                                                                |
| **Languages**                   | 2 (v1), 11 (v2)                      | 42                                          | 70+ (v3)                                                                       |
| **Max text per request**        | 5,000 chars                          | Not specified                               | Not specified                                                                  |
| **SDKs**                        | Python, TypeScript, .NET, CLI        | Python, TypeScript                          | Python, TS, Go, Ruby, Java, PHP, C#, Swift                                     |
| **Pronunciation control**       | No                                   | Dictionary ID                               | Phoneme tags (limited models), alias tags, dictionaries                        |
| **Continuation/stitching**      | Yes (generation_id context)          | Yes (WebSocket context)                     | Yes (request IDs + previous/next text)                                         |
| **Word-level timestamps**       | Octave 2 only                        | Not confirmed                               | Yes (dedicated endpoints)                                                      |
| **Free tier**                   | 10K chars                            | 20K credits                                 | Limited (varies)                                                               |
| **Cheapest paid plan**          | $3/mo (30K chars)                    | $4/mo (100K credits)                        | ~$5/mo (~30K chars)                                                            |
| **Bulk pricing (per 1K chars)** | $0.05 (Business)                     | ~$0.03 (Scale, estimated)                   | Varies by plan                                                                 |

---

## 5. Recommendations for Audiobook Use

### Best for Emotional Range: Hume AI

Hume's natural-language `description` field is uniquely powerful for audiobooks. You can write acting directions like "whispering conspiratorially", "barely containing rage", or "reading a bedtime story to a child" and the model interprets them. This is far more flexible than Cartesia's enum or ElevenLabs' fixed tag set.

**Caveat:** Acting instructions are currently Octave 1 only, and Octave 1 supports only English and Spanish. If multilingual support matters or Octave 2 acting instructions are not available when you start building, this advantage is limited.

### Best for Distinct Character Voices: ElevenLabs

ElevenLabs has the largest voice library, the most SDK language support, and the most mature voice cloning pipeline. The `[whispers]`, `[laughs]`, `[sarcastic]` audio tags in v3 provide a practical (if less flexible) approach to emotional inflection. Pronunciation dictionaries are valuable for fantasy/sci-fi character names.

**Caveat:** The v3 model dropping SSML support is a notable regression for users who relied on `<break>` tags for pacing. The shift to audio tags is still maturing.

### Best for Speed / Real-Time Preview: Cartesia

Cartesia's 90ms latency (40ms for Turbo) makes it the fastest option for real-time preview during editing. The 50+ emotion enum values cover most audiobook scenarios. The pricing is competitive (100K credits for $4/mo).

**Caveat:** No free-form acting instructions. You cannot say "whispering while trying not to laugh" -- you pick a single emotion keyword. This limits nuance for complex character moments.

### Architecture Recommendation

For an audiobook tool, consider:

1. **Multi-provider support.** Abstract the TTS provider behind an interface so users can choose based on their needs. Each provider has different strengths.

2. **Chunking strategy.** All three providers support continuation/stitching. Break chapters into utterance-sized chunks (under 5K chars) with context passing for consistent delivery.

3. **Voice mapping.** Maintain a character-to-voice mapping. All three providers let you specify voice per utterance, enabling multi-character chapters.

4. **Backend proxy.** None of these APIs should have keys exposed in the browser. Route all TTS calls through a server-side proxy.

5. **Emotion annotation layer.** Build a preprocessing step that annotates text with emotion/delivery cues before sending to the TTS provider. This layer can translate between the different provider formats:
   - Hume: `description="whispering, fearful"`
   - Cartesia: `generation_config={"emotion": "scared", "volume": 0.6}`
   - ElevenLabs: prepend `[whispers]` to text, set `stability=0.3`

---

## Sources

- Hume AI docs: https://dev.hume.ai/docs/text-to-speech-tts/overview
- Hume pricing: https://www.hume.ai/pricing
- Cartesia docs: https://docs.cartesia.ai/
- Cartesia API reference: https://docs.cartesia.ai/api-reference/tts/bytes
- Cartesia pricing: https://cartesia.ai/pricing
- Cartesia Python SDK: https://github.com/cartesia-ai/cartesia-python
- Cartesia JS SDK: https://github.com/cartesia-ai/cartesia-js
- ElevenLabs docs: https://elevenlabs.io/docs
- ElevenLabs API reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- ElevenLabs Python SDK: https://github.com/elevenlabs/elevenlabs-python
- ElevenLabs best practices: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
