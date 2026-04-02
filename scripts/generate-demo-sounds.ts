/**
 * Generate all music and SFX for the demo project.
 * Calls ElevenLabs API via dev-api proxy, saves MP3 files to public/demo/audio/.
 * Updates manifest.json with file references.
 *
 * Usage: npx tsx scripts/generate-demo-sounds.ts
 * Requires: npm run dev:api running on port 4001
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const MANIFEST_PATH = join(process.cwd(), "public/demo/manifest.json");
const AUDIO_DIR = join(process.cwd(), "public/demo/audio");
const API_URL = "http://localhost:4001/api/elevenlabs/sfx";

async function main() {
  console.log("Reading manifest...");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const analysis = manifest.mixingAnalysis;

  if (!analysis) {
    console.error("No mixingAnalysis in manifest. Run generate-mixing-analysis.ts first.");
    process.exit(1);
  }

  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

  // Initialize generated sounds index
  const generatedFiles: Record<string, { file: string; durationSec: number }> = {};

  // Generate music
  for (const music of analysis.music) {
    const filename = `${music.id}.mp3`;
    const filepath = join(AUDIO_DIR, filename);

    if (existsSync(filepath)) {
      console.log(`  [skip] ${music.id}: ${music.title} (already exists)`);
      generatedFiles[music.id] = { file: `audio/${filename}`, durationSec: music.durationSec || 18 };
      continue;
    }

    console.log(`  [gen] ${music.id}: ${music.title} (${music.durationSec || 18}s loop)...`);
    const prompt = `${music.prompt}, seamless loop, instrumental background music`;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt, duration_seconds: Math.min(music.durationSec || 18, 22), prompt_influence: 0.4, loop: true }),
      });

      if (!res.ok) {
        console.error(`    Error: ${res.status} ${await res.text()}`);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(filepath, buffer);
      console.log(`    Saved: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
      generatedFiles[music.id] = { file: `audio/${filename}`, durationSec: music.durationSec || 18 };
    } catch (err) {
      console.error(`    Error: ${err instanceof Error ? err.message : err}`);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Generate SFX
  for (const sfx of analysis.sfx) {
    const filename = `${sfx.id}.mp3`;
    const filepath = join(AUDIO_DIR, filename);

    if (existsSync(filepath)) {
      console.log(`  [skip] ${sfx.id}: ${sfx.title} (already exists)`);
      generatedFiles[sfx.id] = { file: `audio/${filename}`, durationSec: sfx.durationSec || 5 };
      continue;
    }

    console.log(`  [gen] ${sfx.id}: ${sfx.title} (${sfx.durationSec || 5}s)...`);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sfx.prompt, duration_seconds: sfx.durationSec || 5, prompt_influence: 0.7 }),
      });

      if (!res.ok) {
        console.error(`    Error: ${res.status} ${await res.text()}`);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(filepath, buffer);
      console.log(`    Saved: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
      generatedFiles[sfx.id] = { file: `audio/${filename}`, durationSec: sfx.durationSec || 5 };
    } catch (err) {
      console.error(`    Error: ${err instanceof Error ? err.message : err}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  // Save file references to manifest
  manifest.generatedSounds = generatedFiles;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${Object.keys(generatedFiles).length} sounds saved. Manifest updated.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
