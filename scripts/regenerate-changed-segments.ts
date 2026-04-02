/**
 * Regenerate audio for segments whose voiceText changed.
 * Uses ElevenLabs API via the dev server proxy.
 *
 * Usage: npx tsx scripts/regenerate-changed-segments.ts [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const dryRun = process.argv.includes("--dry-run");
const manifestPath = join(import.meta.dirname, "../public/demo/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// Load .env
const envPath = join(import.meta.dirname, "../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
if (!API_KEY) { console.error("No ELEVENLABS_API_KEY in .env"); process.exit(1); }

const MODEL_ID = "eleven_v3";
const API_BASE = "https://api.elevenlabs.io/v1";

// Build voice map: speaker → voiceId (with aliases for name variations)
const voiceMap: Record<string, string> = {};
for (const [speaker, sel] of Object.entries(manifest.demoSelections as Record<string, { voiceId: string }>)) {
  voiceMap[speaker] = sel.voiceId;
}
// Handle name variations between analysis runs
if (voiceMap["Framton"] && !voiceMap["Framton Nuttel"]) voiceMap["Framton Nuttel"] = voiceMap["Framton"];
if (voiceMap["Framton Nuttel"] && !voiceMap["Framton"]) voiceMap["Framton"] = voiceMap["Framton Nuttel"];

// Find changed segments
const changedIds = new Set<string>(process.argv.filter(a => a.startsWith("seg-")));

// If no specific IDs given, use a pre-computed list
const CHANGED = [
  "seg-1","seg-2","seg-4","seg-5","seg-6","seg-7","seg-8","seg-11",
  "seg-17","seg-18","seg-19","seg-20","seg-21","seg-22","seg-23","seg-24",
  "seg-26","seg-27","seg-28","seg-29","seg-30","seg-31","seg-32","seg-35",
  "seg-37","seg-38","seg-40","seg-41","seg-42","seg-43","seg-46","seg-47",
  "seg-49","seg-50","seg-51","seg-54","seg-55","seg-56","seg-57","seg-58",
  "seg-59","seg-60","seg-61","seg-63",
];
const toRegenerate = changedIds.size > 0 ? [...changedIds] : CHANGED;

const segments: { id: string; speaker: string; voiceText: string }[] = manifest.story.segments;
const segMap = new Map(segments.map(s => [s.id, s]));

async function synthesize(text: string, voiceId: string, prevText?: string, nextText?: string): Promise<Buffer> {
  // Append [pause] for clean tail (matching tts-elevenlabs.ts logic)
  let processedText = text.trimEnd();
  if (!processedText.endsWith("[pause]")) processedText += " [pause]";
  processedText = processedText.replace(/[,;]\s*(\[pause\])$/, ". $1");

  const stability = text.length < 30 ? 0.7 : 0.5;
  const style = text.length < 30 ? 0 : 0.2;

  const body: Record<string, unknown> = {
    text: processedText,
    model_id: MODEL_ID,
    voice_settings: { stability, similarity_boost: 0.75, style, use_speaker_boost: true },
  };
  // Note: previous_text/next_text NOT supported on eleven_v3

  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs ${res.status}: ${msg}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ── Main ──

console.log(`Regenerating ${toRegenerate.length} segments${dryRun ? " (DRY RUN)" : ""}...\n`);

let success = 0;
let failed = 0;

for (const segId of toRegenerate) {
  const seg = segMap.get(segId);
  if (!seg) { console.log(`  ${segId}: NOT FOUND, skipping`); continue; }

  const voiceId = voiceMap[seg.speaker];
  if (!voiceId) { console.log(`  ${segId}: No voice for "${seg.speaker}", skipping`); continue; }

  // Get prev/next context
  const idx = segments.findIndex(s => s.id === segId);
  const prevText = idx > 0 ? segments[idx - 1].voiceText : undefined;
  const nextText = idx < segments.length - 1 ? segments[idx + 1].voiceText : undefined;

  if (dryRun) {
    console.log(`  ${segId} [${seg.speaker}] → ${voiceId} (${seg.voiceText.length} chars)`);
    success++;
    continue;
  }

  try {
    const audio = await synthesize(seg.voiceText, voiceId, prevText, nextText);
    const outPath = join(import.meta.dirname, `../public/demo/audio/${segId}.mp3`);
    writeFileSync(outPath, audio);
    console.log(`  ${segId} [${seg.speaker}] → ${(audio.length / 1024).toFixed(1)}KB`);
    success++;

    // Rate limit: ~2 req/s for free tier, 3 req/s for paid
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    console.error(`  ${segId}: FAILED — ${(err as Error).message.slice(0, 100)}`);
    failed++;
    // Wait longer on rate limit
    await new Promise(r => setTimeout(r, 2000));
  }
}

console.log(`\nDone: ${success} succeeded, ${failed} failed out of ${toRegenerate.length}`);
