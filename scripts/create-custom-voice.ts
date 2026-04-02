/**
 * Create a custom voice via ElevenLabs Voice Design API.
 * Two-step flow: generate previews → save as MP3 samples for comparison.
 *
 * Usage:
 *   npx tsx scripts/create-custom-voice.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Load .env
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Set ELEVENLABS_API_KEY in .env");
  process.exit(1);
}

const API_BASE = "https://api.elevenlabs.io/v1";
const OUT_DIR = join(process.cwd(), "public", "demo", "samples");

// Vera's character traits from story analysis:
// Female, ~15 years old, British, self-possessed, controlled, precise, mischievous
// She tells an elaborate ghost story with convincing detail and feigned emotion
const VOICE_DESCRIPTION =
  "A young British woman with a youthful, clear voice. She is self-possessed and composed " +
  "with a subtle mischievous edge. She speaks with precise diction and quiet confidence, " +
  "as if she knows something you don't. There is an understated theatrical quality to her delivery — " +
  "she can shift from calm composure to faltering emotion convincingly. " +
  "Her accent is refined English, not posh but well-spoken.";

// Vera's most characteristic line — her ghost story monologue
const SAMPLE_TEXT =
  "Out through that window, three years ago to a day, her husband and her two young brothers " +
  "went off for their day's shooting. [pause] They never came back. In crossing the moor to their " +
  "favourite snipe-shooting ground they were all three engulfed in a treacherous piece of bog. " +
  "[pause] Their bodies were never recovered. That was the dreadful part of it. [pause]";

async function generatePreviews(): Promise<
  { generated_voice_id: string; audio_base_64: string; duration_secs: number }[]
> {
  console.log("Generating voice previews from description...");
  console.log(`Description: "${VOICE_DESCRIPTION}"\n`);
  console.log(`Sample text: "${SAMPLE_TEXT.slice(0, 80)}..."\n`);

  const res = await fetch(`${API_BASE}/text-to-voice/create-previews`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice_description: VOICE_DESCRIPTION,
      text: SAMPLE_TEXT,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Voice design failed: ${res.status} ${msg}`);
  }

  const data = await res.json();
  return data.previews;
}

async function synthesizeWithVoice(
  voiceId: string,
  text: string,
): Promise<Buffer> {
  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 1.0,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
      seed: 42,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`TTS failed: ${res.status} ${msg}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // Step 1: Generate previews from voice description
  const previews = await generatePreviews();
  console.log(`Got ${previews.length} preview(s)\n`);

  // Save preview audio files (these use the voice design model, not eleven_v3)
  for (let i = 0; i < previews.length; i++) {
    const p = previews[i];
    const previewFile = `el-vera-custom-preview-${i + 1}.mp3`;
    const audioBuffer = Buffer.from(p.audio_base_64, "base64");
    writeFileSync(join(OUT_DIR, previewFile), audioBuffer);
    console.log(
      `  Preview ${i + 1}: ${previewFile} (${(audioBuffer.length / 1024).toFixed(1)}KB, ${p.duration_secs?.toFixed(1) ?? "?"}s)`,
    );
    console.log(`    generated_voice_id: ${p.generated_voice_id}`);
  }

  // Step 2: Generate TTS samples using each preview voice with eleven_v3
  // This lets us compare the custom voice with the same model as our presets
  console.log("\nGenerating eleven_v3 TTS samples with each custom voice...\n");

  for (let i = 0; i < previews.length; i++) {
    const p = previews[i];
    const slug = `el-vera-custom-${i + 1}`;
    const file = `${slug}.mp3`;
    console.log(`  Custom voice ${i + 1} (${p.generated_voice_id})...`);
    try {
      const buffer = await synthesizeWithVoice(p.generated_voice_id, SAMPLE_TEXT);
      writeFileSync(join(OUT_DIR, file), buffer);
      console.log(`    -> ${file} (${(buffer.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    -> TTS FAILED: ${(err as Error).message}`);
      console.log(`    (Preview audio still saved as el-vera-custom-preview-${i + 1}.mp3)`);
    }
  }

  // Output the voice IDs for saving later
  console.log("\n--- Generated Voice IDs (temporary, save the one you pick) ---");
  for (let i = 0; i < previews.length; i++) {
    console.log(`  Custom ${i + 1}: ${previews[i].generated_voice_id}`);
  }
  console.log(
    "\nTo save a voice permanently, call POST /v1/text-to-voice with the generated_voice_id",
  );
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
