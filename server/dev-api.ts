import express from "express";
import { spawn } from "child_process";
import crypto from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getAnalysisPrompt, ENRICHMENT_SYSTEM_PROMPT, buildEnrichmentUserPrompt, MIXING_ANALYSIS_PROMPT, buildMixingUserPrompt } from "./prompts.js";

// Load .env for API keys
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const EL_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const EL_BASE = "https://api.elevenlabs.io/v1";

const app = express();
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});
app.use((req, res, next) => {
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});
app.use(express.json({ limit: "1mb" }));

const PORT = 4001;

// ── Job store ────────────────────────────────────────────────────────────

interface Job {
  id: string;
  status: "running" | "done" | "error";
  logs: string[];
  partial: string;
  result: unknown | null;
  error: string | null;
  startedAt: number;
}

const jobs = new Map<string, Job>();

// ── Start analysis ───────────────────────────────────────────────────────

app.post("/api/analyze", (req, res) => {
  const { storyText, ttsProvider = "browser" } = req.body;

  if (!storyText || typeof storyText !== "string") {
    res.status(400).json({ error: "storyText is required" });
    return;
  }

  const jobId = crypto.randomUUID().slice(0, 8);
  const job: Job = {
    id: jobId,
    status: "running",
    logs: [],
    partial: "",
    result: null,
    error: null,
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  function addLog(msg: string) {
    console.log(`[${jobId}] ${msg}`);
    job.logs.push(msg);
  }

  addLog(`Analyzing story (${storyText.length} chars) for provider: ${ttsProvider}`);

  const systemPrompt = getAnalysisPrompt(ttsProvider);
  const userPrompt = `Analyze this story and return ONLY the JSON result:\n\n${storyText}`;

  addLog("Spawning claude -p --model sonnet ...");

  const child = spawn(
    "claude",
    [
      "-p",
      "--model", "sonnet",
      "--output-format", "stream-json",
      "--verbose",
      "--system-prompt", systemPrompt,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  let fullText = "";
  let buffer = "";

  child.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);

        if (msg.type === "system" && msg.subtype === "init") {
          addLog(`Claude initialized (model: ${msg.model})`);
        } else if (msg.type === "system" && msg.subtype === "hook_started") {
          addLog(`Hook: ${msg.hook_name} started`);
        } else if (msg.type === "system" && msg.subtype === "hook_response") {
          addLog(`Hook: ${msg.hook_name} done`);
        } else if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
          const text = msg.message.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
            .join("");
          if (text) {
            fullText = text;
            job.partial = fullText;
          }
        } else if (msg.type === "result" && msg.result) {
          fullText = msg.result;
          addLog(`Claude finished (${msg.duration_ms}ms, cost: $${msg.total_cost_usd?.toFixed(4)})`);
        }
      } catch {
        // partial line
      }
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    addLog(`stderr: ${data.toString().trim()}`);
  });

  child.on("close", (code) => {
    if (code !== 0 && !fullText) {
      job.status = "error";
      job.error = `claude exited with code ${code}`;
      addLog(`Error: ${job.error}`);
      return;
    }

    try {
      const cleaned = fullText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      addLog(`Done: ${parsed.characters?.length} characters, ${parsed.segments?.length} segments`);
      job.status = "done";
      job.result = parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse error";
      addLog(`Parse error: ${msg}`);
      job.status = "error";
      job.error = `Failed to parse response: ${msg}`;
    }
  });

  child.on("error", (err) => {
    job.status = "error";
    job.error = err.message;
    addLog(`Spawn error: ${err.message}`);
  });

  child.stdin.write(userPrompt);
  child.stdin.end();

  res.json({ jobId });
});

// ── Poll job status ──────────────────────────────────────────────────────

app.get("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const elapsed = Math.floor((Date.now() - job.startedAt) / 1000);

  res.json({
    id: job.id,
    status: job.status,
    elapsed,
    logs: job.logs,
    partial: job.partial,
    result: job.result,
    error: job.error,
  });

  // Clean up completed jobs after they're polled
  if (job.status !== "running") {
    setTimeout(() => jobs.delete(job.id), 60_000);
  }
});

// ── Enrichment (pass 2: relationships + voice profiles) ─────────────────

app.post("/api/enrich", (req, res) => {
  const { characters, segments } = req.body;

  if (!characters || !Array.isArray(characters)) {
    res.status(400).json({ error: "characters array is required" });
    return;
  }

  // Pick up to 5 key segments per character for context
  const segsByChar = new Map<string, typeof segments>();
  for (const seg of (segments ?? [])) {
    const arr = segsByChar.get(seg.speaker) ?? [];
    if (arr.length < 5) arr.push(seg);
    segsByChar.set(seg.speaker, arr);
  }
  const sampleSegs = [...segsByChar.values()].flat();

  const jobId = crypto.randomUUID().slice(0, 8);
  const job: Job = {
    id: jobId,
    status: "running",
    logs: [],
    partial: "",
    result: null,
    error: null,
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  function addLog(msg: string) {
    console.log(`[enrich-${jobId}] ${msg}`);
    job.logs.push(msg);
  }

  const userPrompt = buildEnrichmentUserPrompt(characters, sampleSegs);
  addLog(`Enriching ${characters.length} characters with ${sampleSegs.length} sample segments`);
  addLog("Spawning claude -p --model sonnet ...");

  const child = spawn(
    "claude",
    [
      "-p",
      "--model", "sonnet",
      "--output-format", "stream-json",
      "--verbose",
      "--system-prompt", ENRICHMENT_SYSTEM_PROMPT,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  let fullText = "";
  let buffer = "";

  child.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "system" && msg.subtype === "init") {
          addLog(`Claude initialized (model: ${msg.model})`);
        } else if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
          const text = msg.message.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
            .join("");
          if (text) { fullText = text; job.partial = fullText; }
        } else if (msg.type === "result" && msg.result) {
          fullText = msg.result;
          addLog(`Claude finished (${msg.duration_ms}ms, cost: $${msg.total_cost_usd?.toFixed(4)})`);
        }
      } catch { /* partial */ }
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    addLog(`stderr: ${data.toString().trim()}`);
  });

  child.on("close", (code) => {
    if (code !== 0 && !fullText) {
      job.status = "error";
      job.error = `claude exited with code ${code}`;
      addLog(`Error: ${job.error}`);
      return;
    }

    try {
      const cleaned = fullText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      addLog(`Done: mermaid=${!!parsed.mermaid}, voiceProfiles=${Object.keys(parsed.voiceProfiles ?? {}).length}`);
      job.status = "done";
      job.result = parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse error";
      addLog(`Parse error: ${msg}`);
      job.status = "error";
      job.error = `Failed to parse enrichment response: ${msg}`;
    }
  });

  child.on("error", (err) => {
    job.status = "error";
    job.error = err.message;
    addLog(`Spawn error: ${err.message}`);
  });

  child.stdin.write(userPrompt);
  child.stdin.end();

  res.json({ jobId });
});

// ── ElevenLabs Shared Voices Search ──────────────────────────────────────

app.get("/api/elevenlabs/search-voices", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  // Forward all query params to ElevenLabs
  const params = new URLSearchParams();
  const allowed = [
    "page_size", "page", "gender", "age", "accent", "language",
    "locale", "search", "use_cases", "descriptives", "category",
    "featured", "sort",
  ];
  for (const key of allowed) {
    const val = req.query[key];
    if (val !== undefined) {
      if (Array.isArray(val)) {
        for (const v of val) params.append(key, String(v));
      } else {
        params.set(key, String(val));
      }
    }
  }

  // Default to English narrative voices
  if (!params.has("language")) params.set("language", "en");
  if (!params.has("page_size")) params.set("page_size", "100");

  const url = `${EL_BASE}/shared-voices?${params.toString()}`;
  console.log(`[search-voices] ${url}`);

  try {
    const elRes = await fetch(url, {
      headers: { "xi-api-key": EL_API_KEY },
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    const data = await elRes.json();
    console.log(`[search-voices] ${data.voices?.length ?? 0} voices (total: ${data.total_count})`);
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[search-voices] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── ElevenLabs Voice Design proxy ────────────────────────────────────────

app.post("/api/elevenlabs/voice-design", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  const { voice_description, text, auto_generate_text, guidance_scale, seed } = req.body;

  if (!voice_description) {
    res.status(400).json({ error: "voice_description is required" });
    return;
  }

  console.log(`[voice-design] Generating previews: "${voice_description.slice(0, 60)}..."`);

  try {
    const body: Record<string, unknown> = { voice_description };
    if (text) body.text = text;
    if (auto_generate_text !== undefined) body.auto_generate_text = auto_generate_text;
    if (guidance_scale !== undefined) body.guidance_scale = guidance_scale;
    if (seed !== undefined) body.seed = seed;

    const elRes = await fetch(`${EL_BASE}/text-to-voice/create-previews`, {
      method: "POST",
      headers: {
        "xi-api-key": EL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      console.log(`[voice-design] ElevenLabs error: ${elRes.status} ${msg}`);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    const data = await elRes.json();
    console.log(`[voice-design] Got ${data.previews?.length ?? 0} previews`);
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[voice-design] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── ElevenLabs Save Voice ────────────────────────────────────────────────

app.post("/api/elevenlabs/voice-save", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  const { voice_name, voice_description, generated_voice_id, labels } = req.body;

  if (!voice_name || !voice_description || !generated_voice_id) {
    res.status(400).json({ error: "voice_name, voice_description, and generated_voice_id are required" });
    return;
  }

  console.log(`[voice-save] Saving "${voice_name}" from preview ${generated_voice_id}`);

  try {
    const body: Record<string, unknown> = { voice_name, voice_description, generated_voice_id };
    if (labels) body.labels = labels;

    const elRes = await fetch(`${EL_BASE}/text-to-voice/create-voice-from-preview`, {
      method: "POST",
      headers: {
        "xi-api-key": EL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      console.log(`[voice-save] ElevenLabs error: ${elRes.status} ${msg}`);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    const data = await elRes.json();
    console.log(`[voice-save] Saved! voice_id: ${data.voice_id}`);
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[voice-save] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── ElevenLabs TTS proxy ─────────────────────────────────────────────────

app.post("/api/elevenlabs/tts", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  const { voice_id, text, stability, similarity_boost, style, seed } = req.body;

  if (!voice_id || !text) {
    res.status(400).json({ error: "voice_id and text are required" });
    return;
  }

  console.log(`[tts] Synthesizing with voice ${voice_id}: "${text.slice(0, 50)}..."`);

  try {
    const elRes = await fetch(`${EL_BASE}/text-to-speech/${voice_id}`, {
      method: "POST",
      headers: {
        "xi-api-key": EL_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_v3",
        voice_settings: {
          stability: stability ?? 1.0,
          similarity_boost: similarity_boost ?? 0.75,
          style: style ?? 0.0,
          use_speaker_boost: true,
        },
        ...(seed !== undefined ? { seed } : {}),
      }),
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      console.log(`[tts] ElevenLabs error: ${elRes.status} ${msg}`);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    const buffer = Buffer.from(await elRes.arrayBuffer());
    console.log(`[tts] Done: ${(buffer.length / 1024).toFixed(1)}KB`);
    res.set("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[tts] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── ElevenLabs TTS + save to file ─────────────────────────────────────────

app.post("/api/elevenlabs/tts-save", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  const { voice_id, text, stability, similarity_boost, style, seed, filename } = req.body;

  if (!voice_id || !text || !filename) {
    res.status(400).json({ error: "voice_id, text, and filename are required" });
    return;
  }

  console.log(`[tts-save] Synthesizing ${voice_id} -> ${filename}`);

  try {
    const elRes = await fetch(`${EL_BASE}/text-to-speech/${voice_id}`, {
      method: "POST",
      headers: {
        "xi-api-key": EL_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_v3",
        voice_settings: {
          stability: stability ?? 1.0,
          similarity_boost: similarity_boost ?? 0.75,
          style: style ?? 0.0,
          use_speaker_boost: true,
        },
        ...(seed !== undefined ? { seed } : {}),
      }),
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    const buffer = Buffer.from(await elRes.arrayBuffer());
    const { writeFileSync, mkdirSync, existsSync } = await import("fs");
    const { dirname } = await import("path");

    const outPath = join(process.cwd(), "public", "demo", "samples", filename);
    const dir = dirname(outPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, buffer);

    console.log(`[tts-save] Saved ${outPath} (${(buffer.length / 1024).toFixed(1)}KB)`);

    // Also return the audio so the UI can play it immediately
    res.set("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[tts-save] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── ElevenLabs Delete Voice ───────────────────────────────────────────────

app.post("/api/elevenlabs/voice-delete", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  const { voice_id } = req.body;
  if (!voice_id) {
    res.status(400).json({ error: "voice_id is required" });
    return;
  }

  console.log(`[voice-delete] Deleting voice ${voice_id}`);

  try {
    const elRes = await fetch(`${EL_BASE}/voices/${voice_id}`, {
      method: "DELETE",
      headers: { "xi-api-key": EL_API_KEY },
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      console.log(`[voice-delete] ElevenLabs error: ${elRes.status} ${msg}`);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    console.log(`[voice-delete] Deleted ${voice_id}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[voice-delete] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── Mixing Analysis (Pass 3) ─────────────────────────────────────────────

app.post("/api/analyze-mixing", (req, res) => {
  const { segments, characters } = req.body;

  if (!segments?.length || !characters?.length) {
    res.status(400).json({ error: "segments and characters are required" });
    return;
  }

  const jobId = crypto.randomUUID().slice(0, 8);
  const job: Job = {
    id: jobId,
    status: "running",
    logs: [],
    partial: "",
    result: null,
    error: null,
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  function addLog(msg: string) {
    console.log(`[mix-${jobId}] ${msg}`);
    job.logs.push(msg);
  }

  addLog(`Analyzing mixing for ${segments.length} segments, ${characters.length} characters`);

  const userPrompt = buildMixingUserPrompt(segments, characters);
  addLog("Spawning claude -p --model sonnet for mixing analysis...");

  const child = spawn(
    "claude",
    ["-p", "--model", "sonnet", "--output-format", "stream-json", "--verbose", "--system-prompt", MIXING_ANALYSIS_PROMPT],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  let fullText = "";
  let buffer = "";

  child.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
          const text = msg.message.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
          if (text) { fullText = text; job.partial = fullText; }
        } else if (msg.type === "result" && msg.result) {
          fullText = msg.result;
          addLog(`Claude finished (${msg.duration_ms}ms, cost: $${msg.total_cost_usd?.toFixed(4)})`);
        }
      } catch { /* partial */ }
    }
  });

  child.stderr.on("data", (data: Buffer) => { addLog(`stderr: ${data.toString().trim()}`); });

  child.on("close", (code) => {
    if (code !== 0 && !fullText) {
      job.status = "error";
      job.error = `claude exited with code ${code}`;
      addLog(`Error: ${job.error}`);
      return;
    }
    try {
      const cleaned = fullText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      addLog(`Done: ${parsed.music?.length ?? 0} music, ${parsed.sfx?.length ?? 0} sfx suggestions`);
      job.status = "done";
      job.result = parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse error";
      addLog(`Parse error: ${msg}`);
      job.status = "error";
      job.error = `Failed to parse mixing response: ${msg}`;
    }
  });

  child.on("error", (err) => { job.status = "error"; job.error = err.message; addLog(`Spawn error: ${err.message}`); });

  child.stdin.write(userPrompt);
  child.stdin.end();
  res.json({ jobId });
});

// ── ElevenLabs Sound Effects generation ──────────────────────────────────

app.post("/api/elevenlabs/sfx", async (req, res) => {
  if (!EL_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    return;
  }

  const { text, duration_seconds, prompt_influence, loop } = req.body;

  if (!text) {
    res.status(400).json({ error: "text (prompt) is required" });
    return;
  }

  console.log(`[sfx] Generating: "${text.slice(0, 60)}..."${duration_seconds ? ` (${duration_seconds}s)` : ""}${loop ? " [loop]" : ""}`);

  try {
    const elRes = await fetch(`${EL_BASE}/sound-generation`, {
      method: "POST",
      headers: {
        "xi-api-key": EL_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        ...(duration_seconds ? { duration_seconds } : {}),
        prompt_influence: prompt_influence ?? 0.3,
        ...(loop ? { loop: true } : {}),
      }),
    });

    if (!elRes.ok) {
      const msg = await elRes.text().catch(() => elRes.statusText);
      console.log(`[sfx] ElevenLabs error: ${elRes.status} ${msg}`);
      res.status(elRes.status).json({ error: msg });
      return;
    }

    const buffer = Buffer.from(await elRes.arrayBuffer());
    console.log(`[sfx] Done: ${(buffer.length / 1024).toFixed(1)}KB`);
    res.set("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[sfx] Error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── Start server ─────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[dev-api] Running on http://localhost:${PORT}`);
  console.log(`[dev-api] Using: claude -p --model sonnet (polling)`);
  console.log(`[dev-api] ElevenLabs API: ${EL_API_KEY ? "configured" : "NOT configured"}`);
});
