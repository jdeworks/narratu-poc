import { useState, useEffect } from "react";
import { useProjectStore } from "../stores/project-store";
import {
  useSettingsStore,
  LLM_PROVIDERS,
  TTS_PROVIDERS,
  IS_DEV,
  type LlmProvider,
  type TtsProvider,
} from "../stores/settings-store";
import { estimateTokens, MAX_TOKENS } from "../utils/tokens";

const STORAGE_KEY = "draft-story";

const PLACEHOLDER = `Paste your short story here...

Example:
"The old lighthouse keeper squinted through the rain. 'Storm's coming,' he muttered to himself, pulling his coat tighter. Behind him, a voice he hadn't heard in twenty years said, 'Hello, Father.'"`;

function loadDraft(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export default function StoryInput() {
  const { storyText, setStoryText, setView, autoSave } = useProjectStore();
  const settings = useSettingsStore();
  const [localText, setLocalText] = useState(storyText || loadDraft);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, localText);
  }, [localText]);

  const tokens = estimateTokens(localText);
  const isOverLimit = tokens > MAX_TOKENS;
  const isReady = localText.trim().length > 0 && !isOverLimit;

  const tokenPercent = Math.min((tokens / MAX_TOKENS) * 100, 100);

  const visibleLlm = IS_DEV ? LLM_PROVIDERS : LLM_PROVIDERS.filter((p) => !p.devOnly);
  const visibleTts = IS_DEV ? TTS_PROVIDERS : TTS_PROVIDERS.filter((p) => !p.devOnly);
  const selectedLlm = LLM_PROVIDERS.find((p) => p.id === settings.llmProvider) ?? visibleLlm[0];
  const selectedTts = TTS_PROVIDERS.find((p) => p.id === settings.ttsProvider) ?? visibleTts[0];

  const usesExternalApi =
    settings.llmProvider !== "local" || selectedTts.requiresKey;

  function handleSubmit(e: React.MouseEvent) {
    e.preventDefault();
    if (!isReady) return;
    setStoryText(localText.trim());
    autoSave();
    setView("processing");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Turn your story into an audiobook
        </h1>
        <p className="text-lg text-[var(--color-text-secondary)]">
          Paste a short story and AI will create a voiced audiobook with
          distinct character voices.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        <label htmlFor="story-text" className="sr-only">Story text</label>
        <textarea
          id="story-text"
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          placeholder={PLACEHOLDER}
          className="h-48 w-full resize-none rounded-lg bg-[var(--color-input-bg)] p-4 text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 sm:h-80"
          spellCheck={false}
        />

        <div className="space-y-3 px-3 py-3">
          {/* LLM Provider */}
          <ProviderRow label="LLM">
            <select
              id="llm"
              value={settings.llmProvider}
              onChange={(e) =>
                settings.setLlmProvider(e.target.value as LlmProvider)
              }
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-3 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
            >
              {visibleLlm.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </ProviderRow>

          <p className="text-xs text-[var(--color-text-muted)]">
            {selectedLlm.description}
          </p>

          {selectedLlm.requiresKey && (
            <div className="space-y-2">
              <input
                type="password"
                value={settings.llmApiKey}
                onChange={(e) => settings.setLlmApiKey(e.target.value)}
                placeholder={`${selectedLlm.name} API key`}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              />
              <input
                type="text"
                value={settings.llmModel}
                onChange={(e) => settings.setLlmModel(e.target.value)}
                placeholder="Model (e.g. gpt-4o, qwen/qwen3-235b-a22b:free)"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              />
              <input
                type="text"
                value={settings.llmBaseUrl}
                onChange={(e) => settings.setLlmBaseUrl(e.target.value)}
                placeholder="Base URL (usually auto-filled)"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[var(--color-border)]" />

          {/* TTS Provider */}
          <ProviderRow label="Voice">
            <select
              id="voice"
              value={settings.ttsProvider}
              onChange={(e) =>
                settings.setTtsProvider(e.target.value as TtsProvider)
              }
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-3 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
            >
              {visibleTts.map((p) => (
                <option key={p.id} value={p.id} disabled={p.disabled}>
                  {p.name}
                  {p.disabled ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
          </ProviderRow>

          <p className="text-xs text-[var(--color-text-muted)]">
            {selectedTts.description}
          </p>

          {selectedTts.requiresKey && (
            <input
              type="password"
              value={settings.ttsApiKey}
              onChange={(e) => settings.setTtsApiKey(e.target.value)}
              placeholder={`${selectedTts.name} API key`}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
            />
          )}

          {/* Divider */}
          <div className="border-t border-[var(--color-border)]" />

          {/* Token bar + submit */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-border)] sm:w-32">
                <div
                  className={`h-full rounded-full transition-all ${
                    isOverLimit
                      ? "bg-[var(--color-danger)]"
                      : "bg-[var(--color-primary)]"
                  }`}
                  style={{ width: `${tokenPercent}%` }}
                />
              </div>
              <span
                className={`text-sm tabular-nums ${
                  isOverLimit
                    ? "text-[var(--color-danger-text)]"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                ~{tokens.toLocaleString()} / {MAX_TOKENS.toLocaleString()}{" "}
                tokens
              </span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!isReady}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-3 font-medium text-[var(--color-primary-text)] transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
            >
              Create Audiobook
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
        {usesExternalApi
          ? "Your text is sent to the selected API providers. Keys are session-only and never stored."
          : "Your text stays in your browser. Nothing is sent to external servers."}
      </p>
      <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">
        This is a public demo. Backend services, premium TTS integrations, and
        marketplace infrastructure are developed separately.
      </p>
    </div>
  );
}

function ProviderRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-14 shrink-0 text-sm font-medium text-[var(--color-text-secondary)]">
        {label}
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
