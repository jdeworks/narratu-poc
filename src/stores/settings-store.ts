import { create } from "zustand";

/** True when running on localhost or dev tunnel — enables dev-only providers */
export const IS_DEV = typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
   window.location.hostname === "127.0.0.1" ||
   window.location.hostname.endsWith(".trycloudflare.com"));

// ── LLM Providers ──────────────────────────────────────────────────────────

export type LlmProvider =
  | "local"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "azure";

export interface LlmProviderInfo {
  id: LlmProvider;
  name: string;
  description: string;
  requiresKey: boolean;
  baseUrl: string;
  defaultModel: string;
  devOnly?: boolean;
}

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  {
    id: "local",
    name: "Local Dev (Claude CLI)",
    description:
      "Uses local claude -p via dev server. No API key needed. Requires npm run dev:api.",
    requiresKey: false,
    baseUrl: "http://localhost:4001",
    defaultModel: "sonnet",
    devOnly: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description:
      "Access 100+ models including free tiers. Great for testing without cost.",
    requiresKey: true,
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "qwen/qwen3-235b-a22b:free",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o and other OpenAI models. Direct API access.",
    requiresKey: true,
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description:
      "Claude models via Anthropic API. Requires CORS proxy in browser.",
    requiresKey: true,
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    description:
      "Azure-hosted OpenAI models. Enter your deployment endpoint as the base URL.",
    requiresKey: true,
    baseUrl: "",
    defaultModel: "gpt-4o",
  },
];

// ── TTS Providers ──────────────────────────────────────────────────────────

export type TtsProvider = "browser" | "elevenlabs";

export interface TtsProviderInfo {
  id: TtsProvider;
  name: string;
  description: string;
  requiresKey: boolean;
  disabled?: boolean;
  devOnly?: boolean;
}

export const TTS_PROVIDERS: TtsProviderInfo[] = [
  {
    id: "browser",
    name: "Browser (Free)",
    description: "Chrome Web Speech API — free, no key needed. Lower quality.",
    requiresKey: false,
    devOnly: true,
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description:
      "Highest quality voices (MOS 4.8). Inline emotion tags, pronunciation control, 70+ languages.",
    requiresKey: true,
  },
];

// ── Persistence (no keys — only provider/url/model choices) ────────────────

const SETTINGS_KEY = "narratu-settings";

interface PersistedSettings {
  llmProvider: LlmProvider;
  llmBaseUrl: string;
  llmModel: string;
  ttsProvider: TtsProvider;
}

function loadPersistedSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistSettings(s: PersistedSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── Store ──────────────────────────────────────────────────────────────────

interface SettingsState {
  llmProvider: LlmProvider;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  ttsProvider: TtsProvider;
  ttsApiKey: string;
  setLlmProvider: (provider: LlmProvider) => void;
  setLlmApiKey: (key: string) => void;
  setLlmBaseUrl: (url: string) => void;
  setLlmModel: (model: string) => void;
  setTtsProvider: (provider: TtsProvider) => void;
  setTtsApiKey: (key: string) => void;
}

const saved = loadPersistedSettings();
const defaultLlm = IS_DEV ? "local" : "openrouter";
const defaultTts: TtsProvider = IS_DEV ? "browser" : "elevenlabs";
const initialLlm =
  LLM_PROVIDERS.find((p) => p.id === (saved.llmProvider ?? defaultLlm)) ?? LLM_PROVIDERS[0];

export const useSettingsStore = create<SettingsState>((set, get) => ({
  llmProvider: saved.llmProvider ?? defaultLlm,
  llmApiKey: "",
  llmBaseUrl: saved.llmBaseUrl ?? initialLlm.baseUrl,
  llmModel: saved.llmModel ?? initialLlm.defaultModel,
  ttsProvider: saved.ttsProvider ?? defaultTts,
  ttsApiKey: "",
  setLlmProvider: (llmProvider) => {
    const info = LLM_PROVIDERS.find((p) => p.id === llmProvider)!;
    set({ llmProvider, llmBaseUrl: info.baseUrl, llmModel: info.defaultModel });
    const s = get();
    persistSettings({
      llmProvider,
      llmBaseUrl: info.baseUrl,
      llmModel: info.defaultModel,
      ttsProvider: s.ttsProvider,
    });
  },
  setLlmApiKey: (llmApiKey) => set({ llmApiKey }),
  setLlmBaseUrl: (llmBaseUrl) => {
    set({ llmBaseUrl });
    const s = get();
    persistSettings({
      llmProvider: s.llmProvider,
      llmBaseUrl,
      llmModel: s.llmModel,
      ttsProvider: s.ttsProvider,
    });
  },
  setLlmModel: (llmModel) => {
    set({ llmModel });
    const s = get();
    persistSettings({
      llmProvider: s.llmProvider,
      llmBaseUrl: s.llmBaseUrl,
      llmModel,
      ttsProvider: s.ttsProvider,
    });
  },
  setTtsProvider: (ttsProvider) => {
    set({ ttsProvider });
    const s = get();
    persistSettings({
      llmProvider: s.llmProvider,
      llmBaseUrl: s.llmBaseUrl,
      llmModel: s.llmModel,
      ttsProvider,
    });
  },
  setTtsApiKey: (ttsApiKey) => set({ ttsApiKey }),
}));
