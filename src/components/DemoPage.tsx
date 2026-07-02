import { useCallback, useEffect, useRef, useState } from "react";
import { loadDemoManifest, demoAssetUrl, type DemoManifest } from "../types/demo";
import { buildSampleMaps, loadDemoSelections } from "../utils/demo-loader";
import { useProjectStore } from "../stores/project-store";
import { useVoiceSamplesStore } from "../stores/voice-samples-store";
import { getSpeakerColor } from "../utils/speaker-colors";
import CharacterSidebar from "./CharacterSidebar";
import DemoPlayer from "./DemoPlayer";
import DemoSegmentRow from "./DemoSegmentRow";
import AnalysisModal from "./AnalysisModal";
import StoryTextModal from "./StoryTextModal";
import DeviationReport from "./DeviationReport";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { analyzeSegments } from "../engine/segment-analyzer";
import { exportAudiobook, downloadBlob, type ExportProgress } from "../utils/export-audiobook";
import AudioMixerView from "./AudioMixerView";
import SoundSidebar from "./SoundSidebar";
import { useSoundStore } from "../stores/sound-store";
import { useMixerStore } from "../stores/mixer-store";
import { computePeaks } from "../utils/peak-utils";
import { createAudioContext, safeDecode } from "../utils/audio-context";
import { ensureMixerSegmentsLoaded } from "../utils/load-mixer-segments";
import { autoPlaceAll } from "../utils/auto-place";

export default function DemoPage() {
  const [manifest, setManifest] = useState<DemoManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCharacters, setShowCharacters] = useState(true);
  const [focusCharacter, setFocusCharacter] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showStoryText, setShowStoryText] = useState(false);
  const [showDeviationReport, setShowDeviationReport] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showSoundSidebar, setShowSoundSidebar] = useState(false);
  const [soundHighlightIds, setSoundHighlightIds] = useState<string[] | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const segmentAudio = useProjectStore((s) => s.segmentAudioUrls);
  const setSegmentAudio = useProjectStore((s) => s.setSegmentAudioUrls);
  const [visibleCount, setVisibleCount] = useState(20);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { loadDemoData, segments, characters } = useProjectStore();
  const enrichment = useProjectStore((s) => s.enrichment);

  const setSamples = useVoiceSamplesStore((s) => s.setSamples);
  const setVoiceNames = useVoiceSamplesStore((s) => s.setVoiceNames);
  const setSampleTexts = useVoiceSamplesStore((s) => s.setSampleTexts);

  useEffect(() => {
    loadDemoManifest()
      .then((m) => {
        setManifest(m);
        loadDemoData(m.story.characters, m.story.segments, m.enrichment, m.voiceMatches);
        // Initialize per-segment settings with defaults + analyzed optimizations
        const settingsStore = useSegmentSettingsStore.getState();
        settingsStore.initFromSegments(m.story.segments);
        settingsStore.applyAnalyzed(analyzeSegments(m.story.segments));
        // Load mixing analysis from manifest if available
        if (m.mixingAnalysis) {
          useSoundStore.getState().setAnalysis(m.mixingAnalysis);
        }
        // Load pre-generated sounds from demo files, then restore any from IndexedDB
        if (m.generatedSounds) {
          loadDemoSounds(m.generatedSounds);
        }
        useSoundStore.getState().restoreFromDb();
        const { sampleMap, nameMap } = buildSampleMaps(m);
        loadDemoSelections(m, sampleMap, nameMap);
        // Spread to create new references — Zustand skips re-render on same ref
        setSamples({ ...sampleMap });
        setVoiceNames({ ...nameMap });
        if (m.audioSegments?.length > 0) {
          const audioMap: Record<string, string> = {};
          for (const as of m.audioSegments) audioMap[as.segmentId] = demoAssetUrl(as.file);
          setSegmentAudio(audioMap);
        }
        // Apply pre-computed audio optimizations (early stop, etc.) from manifest
        if (m.audioOptimizations) {
          settingsStore.applyAnalyzed(m.audioOptimizations);
        }
        if (m.sampleTexts) setSampleTexts(m.sampleTexts);
        // Pre-place music/SFX regions on mixer timeline after sounds are loaded
        if (m.generatedSounds && m.mixingAnalysis) {
          autoPlaceDemoRegions(m);
        }
      })
      .catch(() => setError("Demo data not available yet. Run npm run demo:generate first."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + 20, segments.length));
  }, [segments.length]);

  const scrollToSegment = useCallback(
    (segId: string) => {
      const idx = segments.findIndex((s) => s.id === segId);
      if (idx === -1) return;
      if (idx >= visibleCount) setVisibleCount(Math.min(idx + 5, segments.length));
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current?.querySelector(`[data-seg-id="${segId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightId(segId);
          setTimeout(() => setHighlightId(null), 1500);
        }
      });
    },
    [segments, visibleCount],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const mixerLoading = useMixerStore((s) => s.loading);
  const mixerSegmentCount = useMixerStore((s) => s.segments.length);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center sm:px-6 sm:py-12">
        <p className="text-[var(--color-text-secondary)]">{error}</p>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center sm:px-6 sm:py-12">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">Loading demo...</p>
      </div>
    );
  }

  const allSpeakers = characters.map((c) => c.name);
  const hasAudio = manifest.audioSegments.length > 0;
  const exportReady = hasAudio && !mixerLoading && mixerSegmentCount >= segments.length;

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
          {/* PoC banner */}
          <div className="mb-4 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-5 py-3 text-sm text-[var(--color-text-secondary)]">
            <strong className="text-[var(--color-warning)]">Proof of Concept</strong>{" "}
            This page demonstrates what Narratu can do. The actual product is being built in a bootstrap manner.
          </div>

          {/* Format badge */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 font-medium text-[var(--color-primary)]">Audiobook</span>
            <span className="hidden sm:inline">Traditional narrated format. The narrator reads all text including dialogue attribution.</span>
            <span className="ml-auto rounded-full border border-dashed border-[var(--color-border)] px-2.5 py-1 text-[var(--color-text-muted)]">Audio Play (coming soon)</span>
          </div>

          {/* Action buttons row */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setShowStoryText(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Full Text
            </button>
            <button
              onClick={() => setShowAnalysis(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              AI Analysis
            </button>
            <button
              onClick={() => setShowDeviationReport(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
              </svg>
              Settings Report
            </button>
            {hasAudio && (
              <button
                onClick={() => setShowMixer(!showMixer)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  showMixer
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="5" width="22" height="14" rx="2" /><path d="M1 10h22" /><path d="M1 15h22" />
                </svg>
                Audio Mixer
              </button>
            )}
          </div>

          {/* Audio Mixer */}
          {showMixer && hasAudio && (
            <div className="mb-6">
              <AudioMixerView
                segmentAudioUrls={segmentAudio}
                segments={segments}
                allSpeakers={allSpeakers}
                onClose={() => setShowMixer(false)}
              />
            </div>
          )}

          {/* Audiobook playback buttons */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setShowPlayer(!showPlayer)}
              disabled={!hasAudio}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                hasAudio
                  ? showPlayer
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                    : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
                  : "cursor-not-allowed border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              {hasAudio ? "Preview Segments" : "Preview (generate audio first)"}
            </button>
            <ExportDropdown
              disabled={!exportReady || !!exportProgress}
              loading={hasAudio && !exportReady}
              exporting={exportProgress}
              onExportVoiceline={() => {
                if (!manifest || !hasAudio) return;
                exportAudiobook(segmentAudio, segments, setExportProgress)
                  .then((blob) => { downloadBlob(blob, `${manifest.title.toLowerCase().replace(/\s+/g, "-")}-voiceline.mp3`); setExportProgress(null); })
                  .catch(() => setExportProgress(null));
              }}
              onExportFull={() => {
                if (!manifest || !hasAudio) return;
                setExportProgress({ phase: "decoding", current: 0, total: 0 });
                importMixerExport().then(({ exportMixerTimeline: exp }) =>
                  exp(segmentAudio, setExportProgress)
                    .then((blob) => { downloadBlob(blob, `${manifest.title.toLowerCase().replace(/\s+/g, "-")}-full.mp3`); setExportProgress(null); })
                    .catch(() => setExportProgress(null))
                );
              }}
            />
          </div>

          {/* Player (collapsible) */}
          {showPlayer && hasAudio && (
            <div className="mb-6"><DemoPlayer manifest={manifest} /></div>
          )}

          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{manifest.title}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {segments.length} segments &middot;{" "}
                <button onClick={() => setShowCharacters(!showCharacters)} className="inline-flex cursor-pointer items-center py-0.5 text-[var(--color-primary)] hover:underline">
                  {characters.length} characters
                </button>
                {" "}&middot; by{" "}
                <a href="https://www.gutenberg.org/files/269/269-h/269-h.htm" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                  Saki (H.H. Munro)
                </a>
                {" "}&middot; Public Domain
              </p>
              <p className="mt-1 max-w-prose text-xs text-[var(--color-text-muted)]">{manifest.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => { setShowCharacters(!showCharacters); if (!showCharacters) setShowSoundSidebar(false); }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  showCharacters ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                Characters
              </button>
              <button
                onClick={() => { setShowSoundSidebar(!showSoundSidebar); if (!showSoundSidebar) setShowCharacters(false); }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  showSoundSidebar ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                Sound & Music
              </button>
            </div>
          </div>

          {/* Segments (infinite scroll) */}
          <div className="space-y-2">
            {segments.slice(0, visibleCount).map((seg) => (
              <DemoSegmentRow
                key={seg.id}
                segment={seg}
                color={getSpeakerColor(seg.speaker, allSpeakers)}
                audioUrl={segmentAudio[seg.id]}
                isHighlighted={highlightId === seg.id || soundHighlightIds?.includes(seg.id)}
                onClickSpeaker={() => { setFocusCharacter(seg.speaker); setShowCharacters(true); }}
              />
            ))}
            {visibleCount < segments.length && (
              <div ref={sentinelRef} className="py-4 text-center">
                <p className="text-xs text-[var(--color-text-muted)]">Showing {visibleCount} of {segments.length} segments...</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
            <p className="text-xs text-[var(--color-text-muted)]">
              {characters.length} distinct AI voices generated for this story.
            </p>
          </div>
        </div>
      </div>

      {showCharacters && (
        <RightDrawer onClose={() => setShowCharacters(false)}>
          <CharacterSidebar
            onClose={() => setShowCharacters(false)}
            focusCharacter={focusCharacter}
            onScrollToSegment={scrollToSegment}
          />
        </RightDrawer>
      )}

      {showSoundSidebar && (
        <RightDrawer onClose={() => setShowSoundSidebar(false)}>
          <SoundSidebar onClose={() => setShowSoundSidebar(false)} onHighlightSegments={setSoundHighlightIds} />
        </RightDrawer>
      )}

      {showAnalysis && (
        <AnalysisModal
          characters={characters}
          segments={segments}
          enrichment={enrichment}
          allSpeakers={allSpeakers}
          onClose={() => setShowAnalysis(false)}
          onSelectCharacter={(name) => { setShowAnalysis(false); setFocusCharacter(name); setShowCharacters(true); }}
          onOpenSoundSidebar={() => { setShowSoundSidebar(true); setShowCharacters(false); }}
        />
      )}

      {showStoryText && manifest.story.text && (
        <StoryTextModal
          text={manifest.story.text}
          title={manifest.title}
          onClose={() => setShowStoryText(false)}
        />
      )}

      {showDeviationReport && (
        <DeviationReport
          allSpeakers={allSpeakers}
          characters={characters}
          defaultCharacters={manifest.story.characters}
          segments={segments}
          storyText={manifest.story.text ?? ""}
          voiceSelections={manifest.demoSelections as Record<string, { voiceId: string; voiceName: string; source: string }> | undefined}
          voiceMatches={manifest.voiceMatches}
          onClose={() => setShowDeviationReport(false)}
        />
      )}
    </div>
  );
}

/** Mobile: overlay drawer from right. Desktop: inline pass-through. */
function RightDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      {/* Mobile: overlay + slide-in from right */}
      <div className="fixed inset-0 z-40 flex justify-end sm:hidden" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative h-full w-72 max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
      {/* Desktop: inline (sidebar renders its own width) */}
      <div className="hidden sm:contents">
        {children}
      </div>
    </>
  );
}

/** Load pre-generated sound files from demo assets into sound store */
async function loadDemoSounds(sounds: Record<string, { file: string; durationSec: number }>) {
  const store = useSoundStore.getState();
  for (const [id, info] of Object.entries(sounds)) {
    // Skip if already loaded (from IndexedDB restore)
    if (store.generated[id]?.blobUrl) continue;
    try {
      const url = demoAssetUrl(info.file);
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const buf = await blob.arrayBuffer();
      const ctx = createAudioContext();
      const decoded = await safeDecode(ctx, buf);
      const peaks = computePeaks(decoded.getChannelData(0), Math.round(decoded.duration * 50));
      await ctx.close();
      useSoundStore.getState().setGenerated(id, { blobUrl, peaks, durationMs: decoded.duration * 1000, generating: false });
    } catch { /* skip failed loads */ }
  }
}

/** After demo sounds are loaded, auto-place all regions on the mixer timeline */
async function autoPlaceDemoRegions(m: DemoManifest) {
  // Wait for sounds to finish loading (they load async in loadDemoSounds)
  const waitForSounds = () => new Promise<void>((resolve) => {
    const check = () => {
      const gen = useSoundStore.getState().generated;
      const expected = Object.keys(m.generatedSounds ?? {});
      const loaded = expected.filter((id) => gen[id]?.blobUrl);
      if (loaded.length >= expected.length) resolve();
      else setTimeout(check, 200);
    };
    check();
  });
  await waitForSounds();

  // Ensure mixer segments are loaded
  const audioUrls = useProjectStore.getState().segmentAudioUrls;
  const segments = useProjectStore.getState().segments;
  if (Object.keys(audioUrls).length === 0) return;
  await ensureMixerSegmentsLoaded(audioUrls, segments);

  // Skip if regions already exist (e.g. user already added them)
  if (useMixerStore.getState().regions.length > 0) return;

  const analysis = useSoundStore.getState().analysis;
  const generated = useSoundStore.getState().generated;
  const mixerSegments = useMixerStore.getState().segments;
  if (!analysis || mixerSegments.length === 0) return;

  const textMap: Record<string, string> = {};
  for (const s of segments) textMap[s.id] = s.voiceText;
  const regions = autoPlaceAll(analysis, mixerSegments, textMap);

  const { addRegion } = useMixerStore.getState();
  for (const r of regions) {
    const baseId = r.id.replace(/^auto-/, "").replace(/-p\d+$/, "");
    const gen = generated[baseId];
    if (gen?.peaks?.length) r.peaks = gen.peaks;
    if (gen?.durationMs) r.clipDurationMs = gen.durationMs;
    addRegion(r);
  }
}

/** Lazy import mixer export to avoid circular deps */
function importMixerExport() {
  return import("../utils/mixer-export");
}

function ExportDropdown({ disabled, loading, exporting, onExportVoiceline, onExportFull }: {
  disabled: boolean;
  loading?: boolean;
  exporting: ExportProgress | null;
  onExportVoiceline: () => void;
  onExportFull: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (exporting && exporting.phase !== "done") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-text-muted)]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
        {exporting.phase === "decoding" && `Decoding ${exporting.current}/${exporting.total}...`}
        {exporting.phase === "processing" && `Processing ${exporting.current}/${exporting.total}...`}
        {exporting.phase === "assembling" && "Assembling..."}
        {exporting.phase === "mixing" && `Mixing ${exporting.current}/${exporting.total}...`}
        {exporting.phase === "encoding" && "Encoding WAV..."}
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      <button
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
          !disabled
            ? "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
            : "cursor-not-allowed border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]"
        }`}
      >
        {loading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        {loading ? "Loading audio..." : "Export"}
        {!loading && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-1">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-xl">
            <button onClick={() => { setOpen(false); onExportVoiceline(); }}
              className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
              <div>
                <div className="text-xs font-medium text-[var(--color-text)]">Export Voiceline</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">Voices + noise gaps only, no music/SFX</div>
              </div>
            </button>
            <button onClick={() => { setOpen(false); onExportFull(); }}
              className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
              <div>
                <div className="text-xs font-medium text-[var(--color-text)]">Export Audiobook</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">Full mix — voices, music, SFX, all settings</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}


