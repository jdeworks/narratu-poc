import { useState, lazy, Suspense } from "react";
import type { CharacterProfile, TextSegment, EnrichmentData } from "../stores/project-store";
import { useSoundStore } from "../stores/sound-store";
import { getSpeakerColor } from "../utils/speaker-colors";

const MermaidViewer = lazy(() => import("./MermaidViewer"));
const AnalysisMixingTab = lazy(() => import("./AnalysisMixingTab"));

type Tab = "extraction" | "relationships" | "voices" | "mixing" | "raw";

/** Sort characters: Narrator first, then by segment count descending. */
function sortCharacters(characters: CharacterProfile[], segments: TextSegment[]): CharacterProfile[] {
  return [...characters].sort((a, b) => {
    if (a.name === "Narrator") return -1;
    if (b.name === "Narrator") return 1;
    const aCount = segments.filter((s) => s.speaker === a.name).length;
    const bCount = segments.filter((s) => s.speaker === b.name).length;
    return bCount - aCount;
  });
}

/** Sort voice profile entries to match character sort order. */
function sortVoiceEntries(
  entries: [string, string][],
  characters: CharacterProfile[],
  segments: TextSegment[],
): [string, string][] {
  const sorted = sortCharacters(characters, segments);
  const order = new Map(sorted.map((c, i) => [c.name, i]));
  return [...entries].sort((a, b) => {
    const ai = order.get(a[0]) ?? 999;
    const bi = order.get(b[0]) ?? 999;
    return ai - bi;
  });
}

interface Props {
  characters: CharacterProfile[];
  segments: TextSegment[];
  enrichment: EnrichmentData | null;
  allSpeakers: string[];
  onClose: () => void;
  onSelectCharacter?: (name: string) => void;
  onOpenSoundSidebar?: () => void;
}

export default function AnalysisModal({
  characters,
  segments,
  enrichment,
  allSpeakers,
  onClose,
  onSelectCharacter,
  onOpenSoundSidebar,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("extraction");

  const tabs: { key: Tab; label: string }[] = [
    { key: "extraction", label: "Characters & Segments" },
    ...(enrichment?.mermaid ? [{ key: "relationships" as const, label: "Relationships" }] : []),
    ...(enrichment?.voiceProfiles ? [{ key: "voices" as const, label: "Voice Profiles" }] : []),
    { key: "mixing", label: "Mixing" },
    { key: "raw", label: "Raw JSON" },
  ];

  function handleCharacterClick(name: string) {
    onSelectCharacter?.(name);
    onClose();
  }

  function handleMermaidNodeClick(nodeId: string) {
    // Mermaid node IDs use underscores for all non-alphanumeric chars
    // e.g. "Mrs_Sappleton" for "Mrs. Sappleton", "Framtons_Sister" for "Framton's Sister"
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const normalized = normalize(nodeId);
    const match = characters.find((c) => normalize(c.name) === normalized);
    if (match) handleCharacterClick(match.name);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="AI Analysis"
        className="mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">AI Analysis Results</h3>
            <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
              {enrichment ? "2 passes" : "1 pass"}
            </span>
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

        {/* Tabs */}
        <div role="tablist" className="flex border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`cursor-pointer px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div role="tabpanel" className="flex-1 overflow-auto p-5">
          {activeTab === "extraction" && (
            <ExtractionTab
              characters={characters}
              segments={segments}
              allSpeakers={allSpeakers}
              onClickCharacter={handleCharacterClick}
            />
          )}
          {activeTab === "relationships" && enrichment?.mermaid && (
            <RelationshipsTab mermaid={enrichment.mermaid} onClickNode={handleMermaidNodeClick} />
          )}
          {activeTab === "voices" && enrichment?.voiceProfiles && (
            <VoiceProfilesTab
              voiceProfiles={enrichment.voiceProfiles}
              characters={characters}
              segments={segments}
              allSpeakers={allSpeakers}
            />
          )}
          {activeTab === "mixing" && (
            <Suspense fallback={<div className="py-8 text-center text-sm text-[var(--color-text-muted)]">Loading...</div>}>
              <AnalysisMixingTab
                segments={segments}
                characters={characters}
                allSpeakers={allSpeakers}
                onOpenSidebar={onOpenSoundSidebar ? () => { onOpenSoundSidebar(); onClose(); } : undefined}
              />
            </Suspense>
          )}
          {activeTab === "raw" && (
            <RawTab characters={characters} segments={segments} enrichment={enrichment} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab components ─────────────────────────────────────────────────────────

function ExtractionTab({
  characters,
  segments,
  allSpeakers,
  onClickCharacter,
}: {
  characters: CharacterProfile[];
  segments: TextSegment[];
  allSpeakers: string[];
  onClickCharacter: (name: string) => void;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-[var(--color-text-secondary)]">
        Pass 1: Character Extraction
      </h4>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        AI analyzed the full story text and extracted {characters.length} characters
        with {segments.length} segments. Click a character to view in sidebar.
      </p>
      <div className="space-y-2">
        {sortCharacters(characters, segments).map((c) => {
          const color = getSpeakerColor(c.name, allSpeakers);
          const charSegments = segments.filter((s) => s.speaker === c.name);
          return (
            <div
              key={c.name}
              onClick={() => onClickCharacter(c.name)}
              className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 transition-colors hover:border-[var(--color-primary)]/40"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.border }} />
                <span className="text-xs font-semibold text-[var(--color-text)]">{c.name}</span>
                <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {charSegments.length} segments
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">{c.description}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {[
                  c.gender !== "unknown" && c.gender,
                  c.age !== "unknown" && c.age,
                  c.origin !== "unknown" && c.origin !== "none" && c.origin,
                  c.dialect !== "unknown" && c.dialect !== "none" && c.dialect,
                ].filter(Boolean).length > 0 && (
                  <span className="mr-0.5 text-xs text-[var(--color-text-muted)]">Profile:</span>
                )}
                {[
                  c.gender !== "unknown" && c.gender,
                  c.age !== "unknown" && c.age,
                  c.origin !== "unknown" && c.origin !== "none" && c.origin,
                  c.dialect !== "unknown" && c.dialect !== "none" && c.dialect,
                ].filter(Boolean).map((tag) => (
                  <span key={tag as string} className="rounded-full border border-[var(--color-text-muted)]/30 px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                    {tag}
                  </span>
                ))}
                {c.voiceTraits?.length > 0 && (
                  <span className="ml-1 mr-0.5 text-xs text-[var(--color-text-muted)]">Voice:</span>
                )}
                {c.voiceTraits?.map((t) => (
                  <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: color.bg, color: color.text }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RelationshipsTab({
  mermaid: mermaidCode,
  onClickNode,
}: {
  mermaid: string;
  onClickNode: (nodeId: string) => void;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-[var(--color-text-secondary)]">
        Pass 2: Character Relationships
      </h4>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Hover to highlight connections. Click a character to open in sidebar.
        Thick = family, normal = social, dotted = conflict/deception.
      </p>
      <Suspense fallback={<div className="p-4 text-xs text-[var(--color-text-muted)]">Loading diagram...</div>}>
        <MermaidViewer code={mermaidCode} onClickNode={onClickNode} />
      </Suspense>
      <details className="mt-2 group">
        <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Diagram source (editable in production)
        </summary>
        <textarea
          value={mermaidCode}
          readOnly
          rows={Math.min(mermaidCode.split("\n").length + 1, 12)}
          className="mt-1.5 w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)] opacity-75"
          title="Editable in production"
        />
      </details>
    </div>
  );
}

function VoiceProfilesTab({
  voiceProfiles,
  characters,
  segments,
  allSpeakers,
}: {
  voiceProfiles: Record<string, string>;
  characters: CharacterProfile[];
  segments: TextSegment[];
  allSpeakers: string[];
}) {
  const sorted = sortVoiceEntries(Object.entries(voiceProfiles), characters, segments);

  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-[var(--color-text-secondary)]">
        Pass 2: Voice Design Profiles
      </h4>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        AI-generated voice descriptions for the ElevenLabs Voice Design API.
        Used as the starting prompt when creating custom voices. Editable in production.
      </p>
      <div className="space-y-1.5">
        {sorted.map(([name, profile]) => {
          const color = getSpeakerColor(name, allSpeakers);
          return (
            <div key={name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.border }} />
                <span className="text-xs font-medium text-[var(--color-text)]">{name}</span>
                <span className="ml-auto shrink-0 text-xs text-[var(--color-text-muted)]">
                  {profile.length} chars
                </span>
              </div>
              <textarea
                value={profile}
                readOnly
                rows={2}
                className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)] opacity-75"
                title="Editable in production"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RawTab({
  characters,
  segments,
  enrichment,
}: {
  characters: CharacterProfile[];
  segments: TextSegment[];
  enrichment: EnrichmentData | null;
}) {
  const mixingAnalysis = useSoundStore((s) => s.analysis);

  return (
    <div className="space-y-2">
      <CollapsibleJson
        label="Pass 1: Story Analysis"
        count={`${characters.length} characters, ${segments.length} segments`}
        data={{ characters, segments }}
      />
      {enrichment && (
        <CollapsibleJson
          label="Pass 2: Enrichment"
          count={`${Object.keys(enrichment.voiceProfiles || {}).length} voice profiles`}
          data={enrichment}
        />
      )}
      {mixingAnalysis && (
        <CollapsibleJson
          label="Pass 3: Mixing Analysis"
          count={`${mixingAnalysis.music?.length ?? 0} music, ${mixingAnalysis.sfx?.length ?? 0} sfx`}
          data={mixingAnalysis}
        />
      )}
    </div>
  );
}

function CollapsibleJson({ label, count, data }: { label: string; count: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--color-border)]/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface)]"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-[10px] text-[var(--color-text-muted)]">{count}</span>
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-[var(--color-border)]/30 bg-[var(--color-bg)] p-3 text-xs leading-relaxed text-[var(--color-text-muted)] whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
