import { useState } from "react";
import { useProjectStore, type TextSegment } from "../stores/project-store";
import {
  useSettingsStore,
  TTS_PROVIDERS,
  IS_DEV,
  type TtsProvider,
} from "../stores/settings-store";
import { getSpeakerColor } from "../utils/speaker-colors";
import { copyToClipboard } from "../utils/clipboard";
import { getEmotionIcon, getInflectionIcon } from "../utils/emotion-icons";
import CharacterSidebar from "./CharacterSidebar";
import AnalysisModal from "./AnalysisModal";

export default function EditorView() {
  const { segments, characters, setSegments, setView } = useProjectStore();
  const enrichment = useProjectStore((s) => s.enrichment);
  const settings = useSettingsStore();
  const [showCharacters, setShowCharacters] = useState(false);
  const [focusCharacter, setFocusCharacter] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const allSpeakers = characters.map((c) => c.name);

  function updateSegment(id: string, updates: Partial<TextSegment>) {
    setSegments(segments.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  function openCharacter(name: string) {
    setFocusCharacter(name);
    setShowCharacters(true);
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Audiobook Editor</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {segments.length} segments &middot;{" "}
                <button
                  onClick={() => setShowCharacters(!showCharacters)}
                  className="text-[var(--color-primary)] hover:underline"
                >
                  {characters.length} characters
                </button>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAnalysis(true)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                AI Analysis
                {enrichment && (
                  <span className="rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs text-[var(--color-primary)]">
                    2 passes
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowCharacters(!showCharacters)}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  showCharacters
                    ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Characters
              </button>
              <button
                onClick={() => setView("generating")}
                className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Generate Audio
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  showSettings
                    ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
                }`}
                title="Settings"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold">Project Settings</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-xs text-[var(--color-text-muted)]">
                    Voice API
                  </label>
                  <select
                    value={settings.ttsProvider}
                    onChange={(e) =>
                      settings.setTtsProvider(e.target.value as TtsProvider)
                    }
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none"
                  >
                    {(IS_DEV ? TTS_PROVIDERS : TTS_PROVIDERS.filter((p) => !p.devOnly)).map((p) => (
                      <option key={p.id} value={p.id} disabled={p.disabled}>
                        {p.name}
                        {p.disabled ? " (coming soon)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {TTS_PROVIDERS.find((p) => p.id === settings.ttsProvider)
                  ?.requiresKey && (
                  <div className="flex items-center gap-3">
                    <label className="w-20 shrink-0 text-xs text-[var(--color-text-muted)]">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={settings.ttsApiKey}
                      onChange={(e) => settings.setTtsApiKey(e.target.value)}
                      placeholder="Enter API key"
                      className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Character chips */}
          <div className="mb-4 flex flex-wrap gap-2">
            {characters.map((c) => {
              const color = getSpeakerColor(c.name, allSpeakers);
              return (
                <button
                  key={c.name}
                  onClick={() => openCharacter(c.name)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors hover:opacity-80"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color.border }}
                  />
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* Segments */}
          <div className="space-y-1.5">
            {segments.map((seg) => (
              <SegmentRow
                key={seg.id}
                segment={seg}
                allSpeakers={allSpeakers}
                onUpdate={updateSegment}
                onSpeakerClick={openCharacter}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right sidebar — overlay on mobile, inline on desktop */}
      {showCharacters && (
        <>
          <div className="fixed inset-0 z-40 flex justify-end sm:hidden" onClick={() => setShowCharacters(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative h-full w-72 max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
              <CharacterSidebar onClose={() => setShowCharacters(false)} focusCharacter={focusCharacter} />
            </div>
          </div>
          <div className="hidden sm:contents">
            <CharacterSidebar onClose={() => setShowCharacters(false)} focusCharacter={focusCharacter} />
          </div>
        </>
      )}

      {showAnalysis && (
        <AnalysisModal
          characters={characters}
          segments={segments}
          enrichment={enrichment}
          allSpeakers={allSpeakers}
          onClose={() => setShowAnalysis(false)}
          onSelectCharacter={(name) => {
            setShowAnalysis(false);
            openCharacter(name);
          }}
        />
      )}
    </div>
  );
}

function SegmentRow({
  segment,
  allSpeakers,
  onUpdate,
  onSpeakerClick,
}: {
  segment: TextSegment;
  allSpeakers: string[];
  onUpdate: (id: string, updates: Partial<TextSegment>) => void;
  onSpeakerClick: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getSpeakerColor(segment.speaker, allSpeakers);

  return (
    <div
      className="rounded-lg border-l-[3px] transition-colors"
      style={{
        borderColor: color.border,
        backgroundColor: expanded ? color.bg : "transparent",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left cursor-pointer"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`mt-0.5 shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSpeakerClick(segment.speaker);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  onSpeakerClick(segment.speaker);
                }
              }}
              className="text-sm font-semibold hover:underline cursor-pointer"
              style={{ color: color.text }}
            >
              {segment.speaker}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(segment.inflection);
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && copyToClipboard(segment.inflection)
              }
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:opacity-70"
              style={{ backgroundColor: color.bg, color: color.text }}
              title="Click to copy"
            >
              <span>{getInflectionIcon(segment.inflection)}</span> {segment.inflection}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(segment.emotion);
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && copyToClipboard(segment.emotion)
              }
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:opacity-70"
              style={{
                backgroundColor: "var(--color-emotion-bg)",
                color: "var(--color-emotion-text)",
              }}
              title="Click to copy"
            >
              <span>{getEmotionIcon(segment.emotion)}</span> {segment.emotion}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text)] leading-relaxed">
            {expanded ? segment.voiceText : truncate(segment.voiceText, 120)}
          </p>
        </div>
      </div>

      {expanded && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: `${color.border}33` }}
        >
          <div className="mb-3">
            <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">
              Original text
            </label>
            <p className="rounded bg-[var(--color-bg)] p-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {segment.originalText}
            </p>
          </div>

          <div className="mb-3">
            <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">
              Voice-optimized text
            </label>
            <textarea
              value={segment.voiceText}
              onChange={(e) =>
                onUpdate(segment.id, { voiceText: e.target.value })
              }
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] p-2 text-sm text-[var(--color-text)] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              rows={2}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">
                Inflection
              </label>
              <input
                type="text"
                value={segment.inflection}
                onChange={(e) =>
                  onUpdate(segment.id, { inflection: e.target.value })
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] p-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              />
            </div>
            <div className="flex-1">
              <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">
                Emotion
              </label>
              <input
                type="text"
                value={segment.emotion}
                onChange={(e) =>
                  onUpdate(segment.id, { emotion: e.target.value })
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] p-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}
