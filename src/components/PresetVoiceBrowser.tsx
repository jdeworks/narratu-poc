import { useState, useEffect } from "react";
import { playAudio, stopAudio, onPlayingChange, getPlayingId } from "../utils/audio-player";
import { useVoiceAssignmentStore } from "../stores/voice-assignment-store";
import { useProjectStore, type StoredVoiceMatch } from "../stores/project-store";
import { useVoiceSamplesStore } from "../stores/voice-samples-store";
import type { PresetVoice } from "../types/voices";

interface ScoredVoice {
  voice: { voice_id: string; name: string; gender: string; age: string; accent: string; descriptive: string; description: string; preview_url: string; category: string };
  score: number;
  reasons: string[];
}

interface Props {
  characterName: string;
  onSelect: (voice: PresetVoice) => void;
  onClose: () => void;
}

export default function PresetVoiceBrowser({
  characterName,
  onSelect,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const [voiceIdInput, setVoiceIdInput] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(getPlayingId());
  const { getAssignedCharacter } = useVoiceAssignmentStore();

  useEffect(() => onPlayingChange(setPlayingId), []);
  const voiceSamples = useVoiceSamplesStore((s) => s.samples);

  // Use stored matches from the project store (computed once during analysis)
  const storedMatches = useProjectStore((s) => s.voiceMatches[characterName]) ?? [];
  const voices: ScoredVoice[] = storedMatches.map((m: StoredVoiceMatch) => ({
    voice: {
      voice_id: m.voice_id, name: m.name, gender: m.gender, age: m.age,
      accent: m.accent, descriptive: m.descriptive, description: m.description,
      preview_url: m.preview_url, category: m.category,
    },
    score: m.score,
    reasons: m.reasons,
  }));

  // Filter by search text (client-side, on already-scored results)
  const filtered = search
    ? voices.filter((sv) => {
        const q = search.toLowerCase();
        return (
          sv.voice.name.toLowerCase().includes(q) ||
          (sv.voice.description || "").toLowerCase().includes(q) ||
          sv.voice.descriptive?.toLowerCase().includes(q)
        );
      })
    : voices;

  function handlePlay(voiceId: string, previewUrl: string) {
    if (playingId === voiceId) {
      stopAudio();
      return;
    }
    const v3Sample = voiceSamples[voiceId]?.mp3;
    playAudio(v3Sample || previewUrl, undefined, voiceId);
  }

  function handleVoiceIdSubmit() {
    const id = voiceIdInput.trim();
    if (!id) return;
    const voice: PresetVoice = {
      id,
      name: `Voice ${id.slice(0, 8)}...`,
      provider: "elevenlabs",
    };
    onSelect(voice);
  }

  function handleSelect(sv: ScoredVoice) {
    const voice: PresetVoice = {
      id: sv.voice.voice_id,
      name: sv.voice.name,
      provider: "elevenlabs",
      gender: sv.voice.gender,
      age: sv.voice.age,
      accent: sv.voice.accent,
    };
    onSelect(voice);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="mx-4 flex h-[80vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Voice Library</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              for {characterName} — ranked by character match
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search + Voice ID input */}
        <div className="space-y-2 border-b border-[var(--color-border)] px-4 py-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter results..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={voiceIdInput}
              onChange={(e) => setVoiceIdInput(e.target.value)}
              placeholder="Paste a voice ID..."
              className="flex-1 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1 text-xs font-mono text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
            <button
              onClick={handleVoiceIdSubmit}
              disabled={!voiceIdInput.trim()}
              className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                voiceIdInput.trim()
                  ? "cursor-pointer bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                  : "cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              Use voice
            </button>
          </div>
        </div>

        {/* Voice list */}
        <div className="flex-1 overflow-auto">
          {filtered.map((sv, i) => {
            const assignedTo = getAssignedCharacter(sv.voice.voice_id);
            const isUsed = assignedTo !== null && assignedTo !== characterName;
            const isTop3 = i < 3 && !search;

            return (
              <div
                key={sv.voice.voice_id}
                className={`flex items-start gap-3 border-b border-[var(--color-border)]/50 px-4 py-2.5 ${
                  isUsed ? "opacity-50" : ""
                } ${isTop3 ? "bg-[var(--color-primary)]/3" : ""}`}
              >
                {/* Rank + Play */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                  {!search && (
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">#{i + 1}</span>
                  )}
                  <button
                    onClick={() => handlePlay(sv.voice.voice_id, sv.voice.preview_url)}
                    className={`cursor-pointer rounded-full p-1.5 transition-colors ${
                      playingId === sv.voice.voice_id
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                        : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                    title={playingId === sv.voice.voice_id ? "Stop" : "Play preview"}
                  >
                    {playingId === sv.voice.voice_id ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Voice info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {sv.voice.name}
                    </span>
                    <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text-muted)]">
                      {sv.score.toFixed(0)}pts
                    </span>
                  </div>
                  {sv.voice.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                      {sv.voice.description.length > 100
                        ? sv.voice.description.slice(0, 100) + "..."
                        : sv.voice.description}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[sv.voice.gender, sv.voice.age?.replace("_", "-"), sv.voice.accent].filter(Boolean).map((t) => (
                      <span key={t} className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                        {t}
                      </span>
                    ))}
                    {sv.voice.descriptive && (
                      <span className="rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs text-[var(--color-primary)]">
                        {sv.voice.descriptive}
                      </span>
                    )}
                    {sv.voice.category && sv.voice.category !== "generated" && (
                      <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                        {sv.voice.category.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  {/* Match reasons */}
                  {sv.reasons.length > 0 && (
                    <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      Match: {sv.reasons.slice(0, 4).join(", ")}
                    </div>
                  )}
                </div>

                {/* Select */}
                <button
                  onClick={() => handleSelect(sv)}
                  disabled={isUsed}
                  className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    isUsed
                      ? "cursor-not-allowed text-[var(--color-text-muted)]"
                      : "cursor-pointer text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                  }`}
                >
                  {isUsed ? `used by ${assignedTo}` : "Select"}
                </button>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
              No voices match your search.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            {filtered.length} voices{search ? " (filtered)" : ""} ranked by character match.
            Audio samples generated with eleven_v3.
          </p>
        </div>
      </div>
    </div>
  );
}
