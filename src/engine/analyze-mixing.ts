/**
 * LLM-powered mixing analysis (Pass 3).
 * Suggests music and SFX placements with word-level anchors.
 * Supports both dev-api proxy and browser-side LLM.
 */

import localforage from "localforage";

const DEV_API_URL = "http://localhost:4001/api";

// ── Types ────────────────────────────────────────────────────────────────

export interface MusicSuggestion {
  id: string;
  title: string;
  prompt: string;
  mood: string;
  placements: { startSegment: string; endSegment: string }[];
  volume: number;
  durationSec: number; // loop length (15-22s)
  fadeInMs: number;
  fadeOutMs: number;
}

export interface SfxSuggestion {
  id: string;
  title: string;
  prompt: string;
  atWords: string;
  segmentId: string;
  timing: "start" | "middle" | "end";
  volume: number;
  durationSec: number;
}

export interface MixingAnalysis {
  music: MusicSuggestion[];
  sfx: SfxSuggestion[];
}

export interface AnalyzeMixingOptions {
  segments: { id: string; speaker: string; voiceText: string; emotion: string; inflection: string }[];
  characters: { name: string; description: string }[];
  onLog?: (msg: string) => void;
}

// ── Cache ────────────────────────────────────────────────────────────────

const cache = localforage.createInstance({ name: "narratu-mixing-cache" });

function cacheKey(segments: { id: string }[]): string {
  const ids = segments.map((s) => s.id).join(",");
  let hash = 0;
  for (let i = 0; i < ids.length; i++) { hash = ((hash << 5) - hash + ids.charCodeAt(i)) | 0; }
  return `mixing-${hash}`;
}

// ── Main entry ───────────────────────────────────────────────────────────

export async function analyzeMixing(opts: AnalyzeMixingOptions): Promise<MixingAnalysis> {
  const key = cacheKey(opts.segments);

  // Check cache
  const cached = await cache.getItem<MixingAnalysis>(key);
  if (cached) {
    opts.onLog?.("Using cached mixing analysis");
    return cached;
  }

  opts.onLog?.("Starting mixing analysis (Pass 3)...");
  const result = await callDevApiPolling(opts);

  // Cache result
  await cache.setItem(key, result);
  opts.onLog?.(`Mixing analysis complete: ${result.music.length} music, ${result.sfx.length} sfx`);
  return result;
}

// ── Dev API (polling) ────────────────────────────────────────────────────

async function callDevApiPolling(opts: AnalyzeMixingOptions): Promise<MixingAnalysis> {
  const startRes = await fetch(`${DEV_API_URL}/analyze-mixing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments: opts.segments, characters: opts.characters }),
  });

  if (!startRes.ok) {
    throw new Error(`Mixing API error: ${startRes.status}`);
  }

  const { jobId } = await startRes.json();
  opts.onLog?.(`Mixing job started: ${jobId}`);

  let prevLogCount = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(`${DEV_API_URL}/job/${jobId}`);
    if (!pollRes.ok) throw new Error(`Poll error: ${pollRes.status}`);

    const job = await pollRes.json();

    for (let i = prevLogCount; i < job.logs.length; i++) {
      opts.onLog?.(job.logs[i]);
    }
    prevLogCount = job.logs.length;

    if (job.status === "done") {
      return validateMixingResult(job.result);
    }

    if (job.status === "error") {
      throw new Error(job.error);
    }
  }
}

// ── Validation ───────────────────────────────────────────────────────────

function validateMixingResult(raw: unknown): MixingAnalysis {
  const data = raw as Record<string, unknown>;
  const music = Array.isArray(data.music) ? data.music : [];
  const sfx = Array.isArray(data.sfx) ? data.sfx : [];

  return {
    music: music.map((m: Record<string, unknown>, i: number) => ({
      id: String(m.id ?? `music-${i}`),
      title: String(m.title ?? "Untitled"),
      prompt: String(m.prompt ?? ""),
      mood: String(m.mood ?? "neutral"),
      placements: Array.isArray(m.placements) ? m.placements.map((p: Record<string, unknown>) => ({
        startSegment: String(p.startSegment ?? ""),
        endSegment: String(p.endSegment ?? ""),
      })) : [],
      volume: Number(m.volume ?? 0.25),
      durationSec: Number(m.durationSec ?? 18),
      fadeInMs: Number(m.fadeInMs ?? 2000),
      fadeOutMs: Number(m.fadeOutMs ?? 3000),
    })),
    sfx: sfx.map((s: Record<string, unknown>, i: number) => ({
      id: String(s.id ?? `sfx-${i}`),
      title: String(s.title ?? "Untitled"),
      prompt: String(s.prompt ?? ""),
      atWords: String(s.atWords ?? ""),
      segmentId: String(s.segmentId ?? ""),
      timing: (["start", "middle", "end"].includes(String(s.timing)) ? String(s.timing) : "start") as "start" | "middle" | "end",
      volume: Number(s.volume ?? 0.6),
      durationSec: Number(s.durationSec ?? 3),
    })),
  };
}
