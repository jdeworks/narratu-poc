import { useState } from "react";
import type { MusicSuggestion, SfxSuggestion } from "../engine/analyze-mixing";

type EditTarget =
  | { type: "music"; item: MusicSuggestion }
  | { type: "sfx"; item: SfxSuggestion };

interface Props {
  target: EditTarget;
  onSave: (updated: EditTarget) => void;
  onClose: () => void;
  disabled?: boolean;
}

export default function SoundEditModal({ target, onSave, onClose, disabled }: Props) {
  const [draft, setDraft] = useState(() =>
    target.type === "music"
      ? { ...target.item }
      : { ...target.item },
  );

  const isMusic = target.type === "music";

  function handleSave() {
    onSave(isMusic
      ? { type: "music", item: draft as MusicSuggestion }
      : { type: "sfx", item: draft as SfxSuggestion },
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Customize {isMusic ? "Music" : "Sound Effect"}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">{draft.title}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Title */}
          <Field label="Title" disabled={disabled}>
            <input type="text" value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text)] disabled:opacity-50 focus:border-[var(--color-primary)] focus:outline-none" />
          </Field>

          {/* Prompt — most important field */}
          <Field label="Generation Prompt" description="This text is sent to ElevenLabs to generate the audio. Be specific: instruments, mood, tempo, environment." disabled={disabled}>
            <textarea value={draft.prompt} rows={4}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-3 font-mono text-xs leading-relaxed text-[var(--color-text)] disabled:opacity-50 focus:border-[var(--color-primary)] focus:outline-none" />
          </Field>

          {/* Mood */}
          {isMusic && (
            <Field label="Mood" disabled={disabled}>
              <input type="text" value={(draft as MusicSuggestion).mood}
                onChange={(e) => setDraft({ ...draft, mood: e.target.value })}
                disabled={disabled}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text)] disabled:opacity-50 focus:border-[var(--color-primary)] focus:outline-none" />
            </Field>
          )}

          {/* Volume */}
          <Field label={`Volume (${Math.round(('volume' in draft ? draft.volume : 0.5) * 100)}%)`} disabled={disabled}>
            <input type="range" min="0" max="1" step="0.05"
              value={'volume' in draft ? draft.volume : 0.5}
              onChange={(e) => setDraft({ ...draft, volume: parseFloat(e.target.value) })}
              disabled={disabled}
              className="w-full cursor-pointer" />
          </Field>

          {/* Duration */}
          {isMusic ? (
            <Field label={`Loop Duration (${(draft as MusicSuggestion).durationSec}s)`} description="Length of the generated loop. Repeats to fill the placement." disabled={disabled}>
              <input type="range" min="10" max="22" step="1"
                value={(draft as MusicSuggestion).durationSec}
                onChange={(e) => setDraft({ ...draft, durationSec: parseInt(e.target.value) })}
                disabled={disabled}
                className="w-full cursor-pointer" />
            </Field>
          ) : (
            <Field label={`Duration (${(draft as SfxSuggestion).durationSec}s)`} disabled={disabled}>
              <input type="range" min="1" max="30" step="1"
                value={(draft as SfxSuggestion).durationSec}
                onChange={(e) => setDraft({ ...draft, durationSec: parseInt(e.target.value) })}
                disabled={disabled}
                className="w-full cursor-pointer" />
            </Field>
          )}

          {/* SFX-specific: word anchor */}
          {!isMusic && (
            <>
              <Field label="Anchor Words" description="Exact words from the voiceText where this sound plays." disabled={disabled}>
                <input type="text" value={(draft as SfxSuggestion).atWords}
                  onChange={(e) => setDraft({ ...draft, atWords: e.target.value })}
                  disabled={disabled}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm italic text-[var(--color-text)] disabled:opacity-50 focus:border-[var(--color-primary)] focus:outline-none" />
              </Field>
              <Field label="Timing" disabled={disabled}>
                <div className="flex gap-2">
                  {(["start", "middle", "end"] as const).map((t) => (
                    <button key={t}
                      onClick={() => !disabled && setDraft({ ...draft, timing: t })}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                        (draft as SfxSuggestion).timing === t
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                          : "border border-[var(--color-border)] text-[var(--color-text-secondary)]"
                      } ${disabled ? "opacity-50" : ""}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* Music-specific: fades */}
          {isMusic && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Fade In (${((draft as MusicSuggestion).fadeInMs / 1000).toFixed(1)}s)`} disabled={disabled}>
                <input type="range" min="500" max="5000" step="500"
                  value={(draft as MusicSuggestion).fadeInMs}
                  onChange={(e) => setDraft({ ...draft, fadeInMs: parseInt(e.target.value) })}
                  disabled={disabled}
                  className="w-full cursor-pointer" />
              </Field>
              <Field label={`Fade Out (${((draft as MusicSuggestion).fadeOutMs / 1000).toFixed(1)}s)`} disabled={disabled}>
                <input type="range" min="500" max="5000" step="500"
                  value={(draft as MusicSuggestion).fadeOutMs}
                  onChange={(e) => setDraft({ ...draft, fadeOutMs: parseInt(e.target.value) })}
                  disabled={disabled}
                  className="w-full cursor-pointer" />
              </Field>
            </div>
          )}

          {disabled && (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-panel-bg)] p-3 text-xs text-[var(--color-text-muted)]">
              Enter your ElevenLabs API key in Settings to enable customization and generation.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]">
            Cancel
          </button>
          <button onClick={handleSave} disabled={disabled}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              !disabled
                ? "bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
                : "cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-muted)]"
            }`}>
            Save & Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, description, disabled, children }: {
  label: string; description?: string; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={disabled ? "opacity-70" : ""}>
      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</label>
      {description && <p className="mb-1.5 text-[10px] text-[var(--color-text-muted)]">{description}</p>}
      {children}
    </div>
  );
}
