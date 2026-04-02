import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import type { CharacterProfile, StoredVoiceMatch } from "../stores/project-store";
import type { SegmentSettings } from "../types/segment-settings";
import { detectPatterns, type DetectedPattern } from "../engine/pattern-detector";
import { useSoundStore } from "../stores/sound-store";
import { useMixerStore } from "../stores/mixer-store";
import CharacterDiff from "./CharacterDiff";
import SegmentDiff from "./SegmentDiff";
import ReportTextTab from "./ReportTextTab";

type Tab = "overview" | "text" | "characters" | "segments" | "sfx" | "music";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "text", label: "Text" },
  { key: "characters", label: "Characters" },
  { key: "segments", label: "Segments" },
  { key: "music", label: "Music" },
  { key: "sfx", label: "Sound Effects" },
];

interface Props {
  allSpeakers: string[];
  characters: CharacterProfile[];
  defaultCharacters: CharacterProfile[];
  segments: { id: string; speaker: string; originalText: string; voiceText: string }[];
  storyText: string;
  voiceSelections?: Record<string, { voiceId: string; voiceName: string; source: string }>;
  voiceMatches?: Record<string, StoredVoiceMatch[]>;
  onClose: () => void;
}

export default function DeviationReport({
  allSpeakers, characters, defaultCharacters, segments: textSegments,
  storyText, voiceSelections, voiceMatches, onClose,
}: Props) {
  const settings = useSegmentSettingsStore((s) => s.settings);
  const getReport = useSegmentSettingsStore((s) => s.getReport);
  const report = useMemo(() => getReport(), [settings, getReport]);
  const [tab, setTab] = useState<Tab>("overview");

  const allSettings = useMemo(() => Object.values(settings), [settings]);

  // Count character-level changes (fields + voice selection that differ from AI defaults)
  const characterChangeCount = useMemo(() => {
    let count = 0;
    for (const c of characters) {
      const def = defaultCharacters.find((d) => d.name === c.name);
      if (!def) continue;
      for (const key of ["description", "gender", "age", "origin", "dialect"] as const) {
        if (c[key] !== def[key]) count++;
      }
      if (JSON.stringify(c.voiceTraits) !== JSON.stringify(def.voiceTraits)) count++;
      // Voice: changed if not from top 3 and not custom-created
      const sel = voiceSelections?.[c.name];
      const matches = voiceMatches?.[c.name];
      if (sel && matches) {
        const fromTop3 = matches.slice(0, 3).some((m) => m.voice_id === sel.voiceId);
        const isCustom = sel.source === "custom";
        if (!fromTop3 && !isCustom) count++;
      }
    }
    return count;
  }, [characters, defaultCharacters, voiceSelections, voiceMatches]);

  const segCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of allSettings) m[s.speaker] = (m[s.speaker] ?? 0) + 1;
    return m;
  }, [allSettings]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Header + tabs */}
        <div className="shrink-0 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between px-6 pt-4 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Settings Report</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Default vs AI optimized vs your changes
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-0 px-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--color-primary)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {tab === "overview" && (
            <OverviewTab report={report} characterChanges={characterChangeCount} allSettings={allSettings} />
          )}
          {tab === "text" && (
            <ReportTextTab storyText={storyText} textSegments={textSegments} allSettings={allSettings} allSpeakers={allSpeakers} />
          )}
          {tab === "characters" && (
            <div className="space-y-1.5">
              {characters.map((c) => (
                <CharacterDiff
                  key={c.name}
                  character={c}
                  defaultCharacter={defaultCharacters.find((d) => d.name === c.name) ?? c}
                  allSpeakers={allSpeakers}
                  voiceSelection={voiceSelections?.[c.name]}
                  voiceMatches={voiceMatches?.[c.name]}
                  segmentCount={segCounts[c.name] ?? 0}
                />
              ))}
            </div>
          )}
          {tab === "segments" && (
            <SegmentsTab allSettings={allSettings} allSpeakers={allSpeakers} />
          )}
          {tab === "sfx" && <SoundTab type="sfx" />}
          {tab === "music" && <SoundTab type="music" />}
        </div>

      </div>
    </div>
  );
}

// ── Tab components ───────────────────────────────────────────────────────

function OverviewTab({ report, characterChanges, allSettings }: {
  report: ReturnType<ReturnType<typeof useSegmentSettingsStore.getState>["getReport"]>;
  characterChanges: number;
  allSettings: SegmentSettings[];
}) {
  const totalUserChanges = report.overridesByOrigin.user + characterChanges;
  const totalSettings = Math.max(1, report.totalSegments * 7);
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [showPatterns, setShowPatterns] = useState(false);

  const changeSub = [];
  if (report.overridesByOrigin.user > 0) changeSub.push(`${report.overridesByOrigin.user} audio`);
  if (characterChanges > 0) changeSub.push(`${characterChanges} character`);

  // Run detection on mount
  useEffect(() => {
    if (allSettings.length === 0) return;
    setDetecting(true);
    detectPatterns(allSettings, (found, passName, done) => {
      setPatterns(found);
      setCurrentPass(passName);
      if (done) setDetecting(false);
    });
  }, [allSettings]);

  // Group by category, sort: warnings first, then suggestions, then info
  const SEVERITY_ORDER: Record<string, number> = { warning: 0, suggestion: 1, info: 2 };
  const SEVERITY_COLORS: Record<string, string> = {
    info: "var(--color-origin-default)",
    suggestion: "var(--color-origin-analyzed)",
    warning: "var(--color-origin-user)",
  };
  const CATEGORY_LABELS: Record<string, string> = {
    audio: "Audio", content: "Content", transition: "Transitions",
    consistency: "Consistency", outlier: "Outliers",
  };

  const sorted = useMemo(() =>
    [...patterns].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)),
  [patterns]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const m: Record<string, DetectedPattern[]> = {};
    for (const p of sorted) (m[p.category] ??= []).push(p);
    return m;
  }, [sorted]);

  const warnCount = patterns.filter((p) => p.severity === "warning").length;
  const sugCount = patterns.filter((p) => p.severity === "suggestion").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Segments" value={report.totalSegments} />
        <SummaryCard label="AI Optimized" value={report.overridesByOrigin.analyzed} sub="settings tuned" />
        <SummaryCard label="Your Changes" value={totalUserChanges} sub={changeSub.length > 0 ? changeSub.join(" + ") : "none yet"} />
        <SummaryCard label="Manual" value={`${Math.round((totalUserChanges / totalSettings) * 100)}%`} sub="of all settings" />
      </div>

      {/* Detected patterns — async with spinner */}
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3">
        <button
          onClick={() => setShowPatterns(!showPatterns)}
          className="flex w-full items-center gap-2 text-left text-sm font-medium text-[var(--color-text-secondary)]"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${showPatterns ? "rotate-90" : ""}`}>
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span>
            Detected Patterns ({patterns.length}
            {warnCount > 0 && <span className="text-[var(--color-origin-user)]">/{warnCount}</span>}
            {sugCount > 0 && <span className="text-[var(--color-origin-analyzed)]">/{sugCount}</span>}
            )
          </span>
          {detecting && (
            <span className="ml-2 flex items-center gap-1.5 text-xs font-normal text-[var(--color-text-muted)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
              {currentPass}...
            </span>
          )}
        </button>
        {showPatterns && Object.keys(grouped).length > 0 && (
          <div className="mt-3 space-y-3">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]/60">
                  {CATEGORY_LABELS[cat] ?? cat} ({items.length})
                </div>
                <div className="space-y-1">
                  {items.map((p) => (
                    <div key={p.id} className="flex items-start gap-2 rounded px-2 py-1 text-sm">
                      <span
                        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: SEVERITY_COLORS[p.severity] }}
                      />
                      <div>
                        <span className="font-medium text-[var(--color-text)]">{p.title}</span>
                        <p className="text-xs text-[var(--color-text-secondary)]">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {showPatterns && !detecting && patterns.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">No patterns detected — all settings look balanced.</p>
        )}
      </div>

      <div className="rounded-lg bg-[var(--color-panel-bg)] p-3">
        <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
          7 analysis passes check gap trends, loudness, emotion distribution, transitions, outliers,
          text complexity, and inflection consistency. Patterns update as each pass completes.
        </p>
      </div>
    </div>
  );
}

function SegmentsTab({ allSettings, allSpeakers }: { allSettings: SegmentSettings[]; allSpeakers: string[] }) {
  const CHUNK = 15;
  const [visibleCount, setVisibleCount] = useState(CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    setVisibleCount((v) => Math.min(v + CHUNK, allSettings.length));
  }, [allSettings.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-1">
      {allSettings.slice(0, visibleCount).map((s, i) => (
        <SegmentDiff key={s.segmentId} settings={s} segIndex={i} allSpeakers={allSpeakers} />
      ))}
      {visibleCount < allSettings.length && (
        <div ref={sentinelRef} className="py-3 text-center text-xs text-[var(--color-text-muted)]">
          {visibleCount} of {allSettings.length} segments...
        </div>
      )}
    </div>
  );
}

function SoundTab({ type }: { type: "music" | "sfx" }) {
  const analysis = useSoundStore((s) => s.analysis);
  const generated = useSoundStore((s) => s.generated);
  const regions = useMixerStore((s) => s.regions);

  const items = type === "music" ? (analysis?.music ?? []) : (analysis?.sfx ?? []);

  if (!analysis) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        No mixing analysis available. Open AI Analysis → Mixing tab first.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-3 grid grid-cols-3 gap-3">
        <SummaryCard label="Total" value={items.length} />
        <SummaryCard label="Generated" value={items.filter((i) => generated[i.id]?.blobUrl).length} />
        <SummaryCard label="Customized" value={items.filter((i) => {
          // Check if prompt was modified from original (would need original to compare)
          // For now, count items with generated audio as "ready"
          return generated[i.id]?.blobUrl;
        }).length} sub="with audio" />
      </div>

      {items.map((item) => {
        const gen = generated[item.id];
        const hasAudio = gen?.blobUrl && !gen.generating;
        // Find mixer region for this item (user may have adjusted volume/fade/position)
        const region = regions.find((r) => r.id.includes(item.id));
        const aiVolume = "volume" in item ? item.volume : 0.5;
        const userVolume = region?.volume;
        const volChanged = userVolume !== undefined && Math.abs(userVolume - aiVolume) > 0.01;
        const userFadeIn = region?.fadeInMs;
        const userFadeOut = region?.fadeOutMs;

        return (
          <div key={item.id} className="rounded-lg border border-[var(--color-border)]/50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  type === "music"
                    ? "bg-[var(--color-origin-analyzed-bg)] text-[var(--color-origin-analyzed)]"
                    : "bg-[var(--color-origin-user-bg)] text-[var(--color-origin-user)]"
                }`}>
                  {type === "music" ? "Music" : "SFX"}
                </span>
                <span className="text-sm font-medium text-[var(--color-text)]">{item.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasAudio && (
                  <span className="rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[9px] text-[var(--color-primary)]">
                    {(gen!.durationMs / 1000).toFixed(0)}s
                  </span>
                )}
                {gen?.generating && <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />}
              </div>
            </div>

            {/* Settings comparison */}
            <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-0.5 text-sm">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Setting</span>
              <span className="text-right text-xs font-medium text-[var(--color-text-muted)]">Default</span>
              <span className="text-right text-xs font-medium text-[var(--color-text-muted)]">AI</span>
              <span className="text-right text-xs font-medium text-[var(--color-text-muted)]">User</span>

              <span className="text-[var(--color-text-muted)]">Volume</span>
              <span className="text-right text-[var(--color-text-secondary)]">{type === "music" ? "3%" : "10%"}</span>
              <span className="text-right text-[var(--color-origin-analyzed)]">
                {Math.round(aiVolume * 100)}%
              </span>
              <span className={`text-right ${volChanged ? "font-medium text-[var(--color-origin-user)]" : "text-[var(--color-text-muted)]"}`}>
                {volChanged ? `${Math.round(userVolume! * 100)}%` : "—"}
              </span>

              {type === "music" && "fadeInMs" in item && (
                <>
                  <span className="text-[var(--color-text-muted)]">Fade In</span>
                  <span className="text-right text-[var(--color-text-secondary)]">2.0s</span>
                  <span className="text-right text-[var(--color-origin-analyzed)]">{(item.fadeInMs / 1000).toFixed(1)}s</span>
                  {(() => {
                    const aiFade = item.fadeInMs;
                    const changed = userFadeIn !== undefined && Math.abs(userFadeIn - aiFade) > 50;
                    return <span className={`text-right ${changed ? "font-medium text-[var(--color-origin-user)]" : "text-[var(--color-text-muted)]"}`}>
                      {changed ? `${(userFadeIn! / 1000).toFixed(1)}s` : "—"}
                    </span>;
                  })()}
                </>
              )}

              {type === "music" && "fadeOutMs" in item && (
                <>
                  <span className="text-[var(--color-text-muted)]">Fade Out</span>
                  <span className="text-right text-[var(--color-text-secondary)]">2.0s</span>
                  <span className="text-right text-[var(--color-origin-analyzed)]">{(item.fadeOutMs / 1000).toFixed(1)}s</span>
                  {(() => {
                    const aiFade = item.fadeOutMs;
                    const changed = userFadeOut !== undefined && Math.abs(userFadeOut - aiFade) > 50;
                    return <span className={`text-right ${changed ? "font-medium text-[var(--color-origin-user)]" : "text-[var(--color-text-muted)]"}`}>
                      {changed ? `${(userFadeOut! / 1000).toFixed(1)}s` : "—"}
                    </span>;
                  })()}
                </>
              )}

              {type === "sfx" && "atWords" in item && (
                <>
                  <span className="text-[var(--color-text-muted)]">Anchor</span>
                  <span className="col-span-3 text-right text-xs italic text-[var(--color-text-secondary)]">
                    &ldquo;{item.atWords.slice(0, 50)}{item.atWords.length > 50 ? "..." : ""}&rdquo;
                  </span>
                </>
              )}
            </div>

            {/* Prompt */}
            <div className="mt-2 rounded bg-[var(--color-bg)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)]">
              {item.prompt}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-panel-bg)] p-3 text-center">
      <div className="text-2xl font-bold text-[var(--color-text)]">{value}</div>
      <div className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{sub}</div>}
    </div>
  );
}
