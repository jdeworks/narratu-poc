/**
 * Generate mixing analysis for the demo project using the LLM.
 * Reads manifest.json, calls the mixing analysis endpoint, saves result back.
 *
 * Usage: npx tsx scripts/generate-mixing-analysis.ts
 * Requires: npm run dev:api running on port 4001
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MANIFEST_PATH = join(process.cwd(), "public/demo/manifest.json");
const API_URL = "http://localhost:4001/api";

async function main() {
  console.log("Reading manifest...");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));

  const segments = manifest.story.segments.map((s: Record<string, string>) => ({
    id: s.id,
    speaker: s.speaker,
    voiceText: s.voiceText,
    emotion: s.emotion,
    inflection: s.inflection,
  }));

  const characters = manifest.story.characters.map((c: Record<string, string>) => ({
    name: c.name,
    description: c.description,
  }));

  console.log(`Sending ${segments.length} segments + ${characters.length} characters to mixing analysis...`);

  // Start job
  const startRes = await fetch(`${API_URL}/analyze-mixing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, characters }),
  });

  if (!startRes.ok) {
    console.error(`Error starting job: ${startRes.status}`);
    process.exit(1);
  }

  const { jobId } = await startRes.json();
  console.log(`Job started: ${jobId}`);

  // Poll
  let prevLogCount = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(`${API_URL}/job/${jobId}`);
    const job = await pollRes.json();

    for (let i = prevLogCount; i < job.logs.length; i++) {
      console.log(`  ${job.logs[i]}`);
    }
    prevLogCount = job.logs.length;

    if (job.status === "done") {
      const result = job.result;
      console.log(`\nResult: ${result.music?.length ?? 0} music, ${result.sfx?.length ?? 0} sfx`);

      // Save to manifest
      manifest.mixingAnalysis = result;
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      console.log(`Saved to ${MANIFEST_PATH}`);
      break;
    }

    if (job.status === "error") {
      console.error(`Job error: ${job.error}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
