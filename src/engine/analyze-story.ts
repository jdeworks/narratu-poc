import localforage from "localforage";
import type { CharacterProfile, TextSegment, EnrichmentData } from "../stores/project-store";
import type { LlmProvider } from "../stores/settings-store";
import { getAnalysisPrompt } from "./prompts";

export interface AnalysisResult {
  characters: CharacterProfile[];
  segments: TextSegment[];
}

export interface AnalyzeOptions {
  storyText: string;
  ttsProvider: string;
  llmProvider: LlmProvider;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  onToken?: (partial: string) => void;
  onLog?: (msg: string) => void;
  onTokenCount?: (n: number) => void;
}

const DEV_API_URL = "http://localhost:4001/api";

const analysisCache = localforage.createInstance({
  name: "narratu",
  storeName: "analysis_cache",
});

function cacheKey(storyText: string, ttsProvider: string): string {
  let hash = 0;
  const str = `${ttsProvider}:${storyText}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `analysis-${hash}`;
}

export async function analyzeStory(
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const { storyText, ttsProvider, llmProvider } = opts;
  const key = cacheKey(storyText, ttsProvider);

  try {
    const cached = await analysisCache.getItem<AnalysisResult>(key);
    if (cached) {
      return cached;
    }
  } catch {
    // Cache miss
  }

  const result =
    llmProvider === "local"
      ? await callLocalDevApiPolling(
          storyText,
          ttsProvider,
          opts.onLog,
          opts.onToken,
        )
      : await callBrowserLlmStreaming(opts);

  try {
    await analysisCache.setItem(key, result);
  } catch {
    // Cache write failed
  }

  return result;
}

// ── Local dev API (polling) ──────────────────────────────────────────────

async function callLocalDevApiPolling(
  storyText: string,
  ttsProvider: string,
  onLog?: (msg: string) => void,
  onToken?: (text: string) => void,
): Promise<AnalysisResult> {
  // Start job
  const startRes = await fetch(`${DEV_API_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyText, ttsProvider }),
  });

  if (!startRes.ok) {
    throw new Error(`Dev API error: ${startRes.status}`);
  }

  const { jobId } = await startRes.json();
  onLog?.(`Job started: ${jobId}`);

  // Poll
  let prevLogCount = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(`${DEV_API_URL}/job/${jobId}`);
    if (!pollRes.ok) {
      throw new Error(`Poll error: ${pollRes.status}`);
    }

    const job = await pollRes.json();

    // Emit new logs
    for (let i = prevLogCount; i < job.logs.length; i++) {
      onLog?.(job.logs[i]);
    }
    prevLogCount = job.logs.length;

    // Emit partial
    if (job.partial) {
      onToken?.(job.partial);
    }

    if (job.status === "done") {
      return {
        characters: job.result.characters,
        segments: job.result.segments,
      };
    }

    if (job.status === "error") {
      throw new Error(job.error);
    }
  }
}

// ── Browser LLM (streaming) ─────────────────────────────────────────────

async function callBrowserLlmStreaming(
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const { storyText, ttsProvider, llmApiKey, llmBaseUrl, llmModel, onToken } =
    opts;

  if (!llmApiKey) {
    throw new Error("API key required for this LLM provider");
  }

  const systemPrompt = getAnalysisPrompt(ttsProvider);
  const url = `${llmBaseUrl.replace(/\/+$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmApiKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this story and return ONLY the JSON result:\n\n${storyText}`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API error ${res.status}: ${body}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onToken?.(fullContent);
        }
      } catch {
        // Partial JSON
      }
    }
  }

  return parseAnalysisResponse(fullContent);
}

export function parseAnalysisResponse(json: string): AnalysisResult {
  const cleaned = json
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  return {
    characters: parsed.characters,
    segments: parsed.segments,
  };
}

// ── Pass 2: Enrichment (relationships + voice profiles) ──────────────────

export interface EnrichOptions {
  characters: CharacterProfile[];
  segments: TextSegment[];
  onLog?: (msg: string) => void;
  onToken?: (partial: string) => void;
}

export async function enrichStory(opts: EnrichOptions): Promise<EnrichmentData> {
  const { characters, segments, onLog, onToken } = opts;
  const key = `enrich-${cacheKey(
    characters.map((c) => c.name).join(","),
    "enrich",
  )}`;

  try {
    const cached = await analysisCache.getItem<EnrichmentData>(key);
    if (cached) {
      onLog?.("Using cached enrichment result");
      return cached;
    }
  } catch { /* miss */ }

  // Call dev API
  const startRes = await fetch(`${DEV_API_URL}/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characters, segments }),
  });

  if (!startRes.ok) {
    throw new Error(`Enrich API error: ${startRes.status}`);
  }

  const { jobId } = await startRes.json();
  onLog?.(`Enrichment job started: ${jobId}`);

  let prevLogCount = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(`${DEV_API_URL}/job/${jobId}`);
    if (!pollRes.ok) throw new Error(`Poll error: ${pollRes.status}`);

    const job = await pollRes.json();

    for (let i = prevLogCount; i < job.logs.length; i++) {
      onLog?.(job.logs[i]);
    }
    prevLogCount = job.logs.length;

    if (job.partial) onToken?.(job.partial);

    if (job.status === "done") {
      const result: EnrichmentData = {
        mermaid: job.result.mermaid,
        voiceProfiles: job.result.voiceProfiles,
      };
      try { await analysisCache.setItem(key, result); } catch { /* ok */ }
      return result;
    }

    if (job.status === "error") {
      throw new Error(job.error);
    }
  }
}
