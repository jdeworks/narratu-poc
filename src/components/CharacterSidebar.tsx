import { useState, useEffect } from "react";
import {
  useProjectStore,
  type CharacterProfile,
  type TextSegment,
} from "../stores/project-store";
import { getSpeakerColor } from "../utils/speaker-colors";
import { extractTags } from "../utils/extract-tags";
import { useVoiceAssignmentStore } from "../stores/voice-assignment-store";
import { useVoiceSamplesStore } from "../stores/voice-samples-store";
import VoiceOptions from "./VoiceOptions";
import CharacterEditModal from "./CharacterEditModal";

interface Props {
  onClose: () => void;
  focusCharacter?: string | null;
  onScrollToSegment?: (segId: string) => void;
}

function sortedCharacters(
  characters: import("../stores/project-store").CharacterProfile[],
  segments: import("../stores/project-store").TextSegment[],
) {
  return [...characters].sort((a, b) => {
    if (a.name === "Narrator") return -1;
    if (b.name === "Narrator") return 1;
    const aCount = segments.filter((s) => s.speaker === a.name).length;
    const bCount = segments.filter((s) => s.speaker === b.name).length;
    return bCount - aCount;
  });
}

export default function CharacterSidebar({ onClose, focusCharacter, onScrollToSegment }: Props) {
  const characters = useProjectStore((s) => s.characters);
  const setCharacters = useProjectStore((s) => s.setCharacters);
  const segments = useProjectStore((s) => s.segments);
  const allSpeakers = characters.map((c) => c.name);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);

  const [openNames, setOpenNames] = useState<Set<string>>(() => {
    return focusCharacter ? new Set([focusCharacter]) : new Set();
  });

  useEffect(() => {
    if (focusCharacter) {
      setOpenNames(new Set([focusCharacter]));
    }
  }, [focusCharacter]);

  function toggle(name: string) {
    setOpenNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:z-40 max-sm:w-80 sm:w-72">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-sm font-semibold">
          Characters ({characters.length})
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpenNames(new Set(characters.map((c) => c.name)))}
            className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            Expand
          </button>
          <button
            onClick={() => setOpenNames(new Set())}
            className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            Collapse
          </button>
          <button
            onClick={onClose}
            className="ml-1 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {sortedCharacters(characters, segments).map((char) => (
          <CharacterAccordion
            key={char.name}
            character={char}
            segments={segments}
            allSpeakers={allSpeakers}
            onScrollToSegment={onScrollToSegment}
            isOpen={openNames.has(char.name)}
            onToggle={() => toggle(char.name)}
            onEdit={() => setEditingCharacter(char.name)}
          />
        ))}
      </div>

      {editingCharacter && (() => {
        const char = characters.find((c) => c.name === editingCharacter);
        if (!char) return null;
        return (
          <CharacterEditModal
            character={char}
            allSpeakers={allSpeakers}
            onSave={(updated) => {
              setCharacters(characters.map((c) => c.name === updated.name ? updated : c));
              setEditingCharacter(null);
            }}
            onClose={() => setEditingCharacter(null)}
          />
        );
      })()}
    </aside>
  );
}

function CharacterAccordion({
  character,
  segments,
  allSpeakers,
  onScrollToSegment,
  isOpen,
  onToggle,
  onEdit,
}: {
  character: CharacterProfile;
  segments: TextSegment[];
  allSpeakers: string[];
  onScrollToSegment?: (segId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const color = getSpeakerColor(character.name, allSpeakers);
  const charSegments = segments.filter((s) => s.speaker === character.name);
  const wordCount = charSegments.reduce(
    (sum, s) => sum + s.originalText.split(/\s+/).length,
    0,
  );
  const assignment = useVoiceAssignmentStore(
    (s) => s.assignments[character.name],
  );

  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="group flex items-center hover:bg-[var(--color-bg)]">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 px-4 py-2.5 text-left"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: color.border }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-tight" style={{ color: color.text }}>
              {character.name}
              {assignment && <span className="ml-1 text-[var(--color-text-muted)]">{"\u2713"}</span>}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {charSegments.length} seg &middot; {wordCount} words
            </div>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`mr-1 shrink-0 text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <button
          onClick={onEdit}
          className="mr-2 shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] group-hover:opacity-100"
          title="Edit character"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3 px-4 pb-4">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">
              Description
            </label>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {character.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <DetailRow label="Gender" value={character.gender} />
            <DetailRow label="Age" value={character.age} />
            <DetailRow label="Origin" value={character.origin} />
            <DetailRow label="Dialect" value={character.dialect} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Voice traits
            </label>
            <div className="flex flex-wrap gap-1">
              {character.voiceTraits.map((trait) => (
                <span
                  key={trait}
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Segments" value={charSegments.length} />
            <StatCard label="Words" value={wordCount} />
          </div>

          <AudioTagCloud segments={charSegments} />

          {/* Sample sentence for voice preview */}
          {charSegments.length > 0 && (
            <SampleSentence
              characterName={character.name}
              segments={charSegments}
              onScrollTo={onScrollToSegment}
            />
          )}

          <VoiceOptions character={character} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value || value === "unknown" || value === "none") return null;
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs text-[var(--color-text-muted)]">{label}:</span>
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
        {value}
      </span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--color-bg)] p-2 text-center">
      <p className="text-lg font-semibold text-[var(--color-text)]">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

function AudioTagCloud({ segments }: { segments: TextSegment[] }) {
  const [expanded, setExpanded] = useState(false);

  // Extract and count all audio tags from voiceText across segments
  const counts = new Map<string, number>();
  for (const s of segments) {
    for (const tag of extractTags(s.voiceText)) {
      if (tag === "pause" || tag === "long pause") continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const COLLAPSED_LIMIT = 6;
  const needsCollapse = sorted.length > COLLAPSED_LIMIT;
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_LIMIT);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
        Audio tags ({sorted.length})
      </label>
      <div className="flex flex-wrap gap-1">
        {visible.map(([tag, count]) => (
          <span
            key={tag}
            className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]"
            title={`${count}x`}
          >
            [{tag}]{count > 1 && <span className="ml-0.5 opacity-60">{count}</span>}
          </span>
        ))}
        {needsCollapse && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
          >
            {expanded ? "show less" : `+${sorted.length - COLLAPSED_LIMIT} more`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Pick the best sample sentence: sweet spot ~40-100 chars, not attribution. */
function pickBestSample(segments: TextSegment[]): TextSegment {
  const scored = segments.map((s) => {
    const len = s.voiceText.length;
    // Sweet spot: 40-100 chars (enough to hear the voice, not too costly)
    let score = 0;
    if (len >= 40 && len <= 100) score += 50;
    else if (len >= 30 && len <= 150) score += 30;
    else if (len < 20) score -= 30;
    else if (len > 200) score -= 20;

    // Penalize attribution lines and mid-sentence fragments
    if (/^(said|asked|replied|cried|whispered|admitted|announced|pursued|his |her |he |she )\b/i.test(s.voiceText)) score -= 60;
    // Penalize lowercase starts (mid-sentence continuation)
    if (/^[a-z]/.test(s.voiceText)) score -= 20;

    // Slight boost for moderate word count
    const words = s.voiceText.split(/\s+/).length;
    if (words >= 8 && words <= 20) score += 10;

    return { segment: s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].segment;
}

function SampleSentence({
  characterName,
  segments,
  onScrollTo,
}: {
  characterName: string;
  segments: TextSegment[];
  onScrollTo?: (segId: string) => void;
}) {
  // Use stored sample text if available (matches the actual audio)
  const storedText = useVoiceSamplesStore((s) => s.sampleTexts[characterName]);
  const best = pickBestSample(segments);
  const rawText = storedText || best.voiceText;
  const display = rawText.length > 120 ? rawText.slice(0, 117) + "..." : rawText;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
        Voice sample text
      </label>
      <p
        className={`rounded bg-[var(--color-bg)] p-2 text-xs italic text-[var(--color-text-secondary)] ${
          onScrollTo
            ? "cursor-pointer hover:ring-1 hover:ring-[var(--color-primary)]/50"
            : ""
        }`}
        onClick={() => onScrollTo?.(best.id)}
        title={onScrollTo ? "Click to find in text" : undefined}
      >
        {display}
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
        {onScrollTo ? "Click to find in text. " : ""}Changeable in production
      </p>
    </div>
  );
}
