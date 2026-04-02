import { useState } from "react";
import type { CharacterProfile } from "../stores/project-store";
import { getSpeakerColor } from "../utils/speaker-colors";

interface Props {
  character: CharacterProfile;
  allSpeakers: string[];
  onSave: (updated: CharacterProfile) => void;
  onClose: () => void;
}

const FIELDS: { key: keyof CharacterProfile; label: string; multiline?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description", multiline: true },
  { key: "gender", label: "Gender" },
  { key: "age", label: "Age" },
  { key: "origin", label: "Origin" },
  { key: "dialect", label: "Dialect" },
];

export default function CharacterEditModal({ character, allSpeakers, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<CharacterProfile>({ ...character, voiceTraits: [...character.voiceTraits] });
  const [traitsText, setTraitsText] = useState(character.voiceTraits.join(", "));
  const color = getSpeakerColor(character.name, allSpeakers);

  function handleFieldChange(key: keyof CharacterProfile, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    const traits = traitsText.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...draft, voiceTraits: traits });
  }

  const hasChanges = FIELDS.some((f) => draft[f.key] !== character[f.key])
    || traitsText !== character.voiceTraits.join(", ");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color.border }} />
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Edit Character</h2>
              <p className="text-sm text-[var(--color-text-muted)]">{character.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  value={String(draft[f.key])}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              ) : (
                <input
                  type="text"
                  value={String(draft[f.key])}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              )}
            </div>
          ))}

          {/* Voice traits */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Voice Traits <span className="font-normal">(comma separated)</span>
            </label>
            <input
              type="text"
              value={traitsText}
              onChange={(e) => setTraitsText(e.target.value)}
              placeholder="warm, measured, gentle"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {traitsText.split(",").map((t) => t.trim()).filter(Boolean).map((trait, i) => (
                <span key={i} className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                  {trait}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              hasChanges
                ? "bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
                : "cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-muted)]"
            }`}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
