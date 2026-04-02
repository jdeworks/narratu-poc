import { useState, useEffect } from "react";
import { useSoundStore, type MusicSuggestion, type SfxSuggestion, type GeneratedSound } from "../stores/sound-store";
import { useMixerStore } from "../stores/mixer-store";
import { useSettingsStore } from "../stores/settings-store";
import { generateSFX, generateMusic } from "../engine/elevenlabs-audio";
import { playAudio, stopAudio, onPlayingChange, getPlayingId } from "../utils/audio-player";
import { computePeaks } from "../utils/peak-utils";
import { autoPlaceAll } from "../utils/auto-place";
import { ensureMixerSegmentsLoaded } from "../utils/load-mixer-segments";
import { useProjectStore } from "../stores/project-store";
import SoundEditModal from "./SoundEditModal";

interface Props {
  onClose: () => void;
  onHighlightSegments?: (segIds: string[] | null) => void;
}

export default function SoundSidebar({ onClose, onHighlightSegments }: Props) {
  const analysis = useSoundStore((s) => s.analysis);
  const analyzing = useSoundStore((s) => s.analyzing);
  const generated = useSoundStore((s) => s.generated);
  const [tab, setTab] = useState<"music" | "sfx">("music");
  const [editingId, setEditingId] = useState<string | null>(null);
  const hasApiKey = !!useSettingsStore((s) => s.ttsApiKey);

  const music = analysis?.music ?? [];
  const sfx = analysis?.sfx ?? [];
  const segments = useProjectStore((s) => s.segments);

  // Clear highlight on unmount
  useEffect(() => () => onHighlightSegments?.(null), []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] sm:w-72">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Sound & Music</h3>
          {analysis && (
            <p className="text-[10px] text-[var(--color-text-muted)]">{music.length} music, {sfx.length} sfx</p>
          )}
        </div>
        <button onClick={onClose} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        {(["music", "sfx"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === t ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {t === "music" ? `Music (${music.length})` : `SFX (${sfx.length})`}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {analysis && (
        <div className="flex gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <GenerateAllButton tab={tab} />
          <AutoAddAllButton />
        </div>
      )}

      {/* Loading */}
      {analyzing && (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-[var(--color-text-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          Analyzing story...
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-auto">
        {tab === "music" && music.map((m) => (
          <MusicAccordion key={m.id} music={m} generated={generated[m.id]} segments={segments}
            onHover={(ids) => onHighlightSegments?.(ids)} onEdit={() => setEditingId(m.id)} />
        ))}
        {tab === "sfx" && sfx.map((s) => (
          <SfxAccordion key={s.id} sfx={s} generated={generated[s.id]} segments={segments}
            onHover={(ids) => onHighlightSegments?.(ids)} onEdit={() => setEditingId(s.id)} />
        ))}
        {!analyzing && (tab === "music" ? music : sfx).length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
            No suggestions. Open AI Analysis → Mixing tab.
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingId && (() => {
        const musicItem = music.find((m) => m.id === editingId);
        const sfxItem = sfx.find((s) => s.id === editingId);
        if (!musicItem && !sfxItem) return null;
        const target = musicItem ? { type: "music" as const, item: musicItem } : { type: "sfx" as const, item: sfxItem! };
        return (
          <SoundEditModal
            target={target}
            disabled={!hasApiKey}
            onSave={(updated) => {
              if (updated.type === "music") useSoundStore.getState().updateMusic(updated.item.id, updated.item);
              else useSoundStore.getState().updateSfx(updated.item.id, updated.item);
              setEditingId(null);
            }}
            onClose={() => setEditingId(null)}
          />
        );
      })()}
    </aside>
  );
}

// ── Music accordion ──────────────────────────────────────────────────────

function MusicAccordion({ music: m, generated: gen, segments, onHover, onEdit }: {
  music: MusicSuggestion; generated?: GeneratedSound;
  segments: { id: string; speaker: string }[];
  onHover: (segIds: string[] | null) => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setGenerated = useSoundStore((s) => s.setGenerated);
  const setGenerating = useSoundStore((s) => s.setGenerating);
  const [playingId, setPlayingId] = useState<string | null>(getPlayingId());
  useEffect(() => onPlayingChange(setPlayingId), []);
  const isPlaying = playingId === m.id;
  const hasAudio = gen && gen.blobUrl && !gen.generating;

  // Compute affected segment IDs for highlighting
  const affectedIds = getAffectedSegmentIds(m.placements, segments);

  return (
    <div
      className="border-b border-[var(--color-border)]/30"
      onMouseEnter={() => onHover(affectedIds)}
      onMouseLeave={() => onHover(null)}
      draggable={!!hasAudio}
      onDragStart={(e) => {
        if (!hasAudio) return;
        e.dataTransfer.setData("application/narratu-sound", JSON.stringify({ id: m.id, type: "music" }));
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      {/* Header — always visible */}
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-bg)]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="rounded-full bg-[var(--color-origin-analyzed-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-origin-analyzed)]">
          {m.placements.length > 1 ? `${m.placements.length}x` : ""}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--color-text)]">{m.title}</div>
          <div className="text-[10px] text-[var(--color-text-muted)]">{m.mood}</div>
        </div>
        {hasAudio && (
          <span className="shrink-0 rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[9px] text-[var(--color-primary)]">
            {(gen!.durationMs / 1000).toFixed(0)}s
          </span>
        )}
      </button>

      {/* Expanded */}
      {open && (
        <div className="space-y-2 px-4 pb-3">
          {/* Affected segments */}
          <div>
            <div className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)]">Plays during</div>
            <div className="flex flex-wrap gap-1">
              {m.placements.map((p, i) => (
                <span key={i} className="rounded bg-[var(--color-origin-analyzed-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-origin-analyzed)]">
                  {p.startSegment} → {p.endSegment}
                </span>
              ))}
            </div>
          </div>

          {/* Affected speakers */}
          <div className="flex flex-wrap gap-1">
            {[...new Set(affectedIds.map((id) => segments.find((s) => s.id === id)?.speaker).filter(Boolean))].map((sp) => (
              <span key={sp} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">{sp}</span>
            ))}
          </div>

          {/* Volume, loop, fades */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--color-text-muted)]">
            <span>Vol: {Math.round(m.volume * 100)}%</span>
            <span>Loop: {m.durationSec}s</span>
            <span>Fade: {m.fadeInMs / 1000}s in / {m.fadeOutMs / 1000}s out</span>
          </div>

          {/* Prompt */}
          <div className="rounded bg-[var(--color-bg)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)]">
            {m.prompt}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]">
              Customize
            </button>
            {!hasAudio && (
              <GenerateButton id={m.id} prompt={m.prompt} type="music" duration={m.durationSec} generating={gen?.generating}
                onGenerated={setGenerated} onGenerating={setGenerating} />
            )}
            {hasAudio && (
              <>
                <PreviewButton id={m.id} url={gen!.blobUrl} isPlaying={isPlaying} volume={m.volume} />
                <AddToMixerButton suggestionId={m.id} type="music" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SFX accordion ────────────────────────────────────────────────────────

function SfxAccordion({ sfx: s, generated: gen, segments, onHover, onEdit }: {
  sfx: SfxSuggestion; generated?: GeneratedSound;
  segments: { id: string; speaker: string }[];
  onHover: (segIds: string[] | null) => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setGenerated = useSoundStore((s) => s.setGenerated);
  const setGenerating = useSoundStore((s) => s.setGenerating);
  const [playingId, setPlayingId] = useState<string | null>(getPlayingId());
  useEffect(() => onPlayingChange(setPlayingId), []);
  const isPlaying = playingId === s.id;
  const hasAudio = gen && gen.blobUrl && !gen.generating;

  const speaker = segments.find((seg) => seg.id === s.segmentId)?.speaker;

  return (
    <div
      className="border-b border-[var(--color-border)]/30"
      onMouseEnter={() => onHover([s.segmentId])}
      onMouseLeave={() => onHover(null)}
      draggable={!!hasAudio}
      onDragStart={(e) => {
        if (!hasAudio) return;
        e.dataTransfer.setData("application/narratu-sound", JSON.stringify({ id: s.id, type: "sfx" }));
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-bg)]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--color-text)]">{s.title}</div>
          <div className="truncate text-[10px] text-[var(--color-text-muted)]">
            {speaker && <span>{speaker} &middot; </span>}
            &ldquo;{s.atWords.slice(0, 30)}{s.atWords.length > 30 ? "..." : ""}&rdquo;
          </div>
        </div>
        {hasAudio && (
          <span className="shrink-0 rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[9px] text-[var(--color-primary)]">
            {(gen!.durationMs / 1000).toFixed(0)}s
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-3">
          {/* Anchor context */}
          <div className="rounded border-l-2 border-[var(--color-origin-user)] bg-[var(--color-bg)] p-2">
            <div className="mb-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
              Plays at {s.timing} of:
            </div>
            <p className="italic text-xs text-[var(--color-text-secondary)]">&ldquo;{s.atWords}&rdquo;</p>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{s.segmentId} &middot; {s.durationSec}s &middot; Vol {Math.round(s.volume * 100)}%</p>
          </div>

          {/* Prompt */}
          <div className="rounded bg-[var(--color-bg)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)]">
            {s.prompt}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]">
              Customize
            </button>
            {!hasAudio && (
              <GenerateButton id={s.id} prompt={s.prompt} type="sfx" duration={s.durationSec}
                generating={gen?.generating} onGenerated={setGenerated} onGenerating={setGenerating} />
            )}
            {hasAudio && (
              <>
                <PreviewButton id={s.id} url={gen!.blobUrl} isPlaying={isPlaying} volume={s.volume} />
                <AddToMixerButton suggestionId={s.id} type="sfx" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────────────

function GenerateButton({ id, prompt, type, duration, generating, onGenerated, onGenerating }: {
  id: string; prompt: string; type: "music" | "sfx"; duration?: number;
  generating?: boolean;
  onGenerated: (id: string, s: GeneratedSound) => void;
  onGenerating: (id: string, g: boolean) => void;
}) {
  return (
    <button onClick={async () => {
      onGenerating(id, true);
      try {
        const blob = type === "music"
          ? await generateMusic(prompt, duration ?? 18)
          : await generateSFX(prompt, duration ?? 5, { promptInfluence: 0.7 });
        const url = URL.createObjectURL(blob);
        const buf = await blob.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf);
        const peaks = computePeaks(decoded.getChannelData(0), Math.round(decoded.duration * 50));
        await ctx.close();
        onGenerated(id, { blobUrl: url, peaks, durationMs: decoded.duration * 1000, generating: false });
      } catch { onGenerating(id, false); }
    }} disabled={!!generating}
      className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
      {generating ? (<><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Generating...</>) : "Generate"}
    </button>
  );
}

function PreviewButton({ id, url, isPlaying, volume }: { id: string; url: string; isPlaying: boolean; volume?: number }) {
  return (
    <button onClick={() => {
      if (isPlaying) { stopAudio(); return; }
      // Preview at higher volume than mix level so it's audible in isolation
      const previewVol = volume !== undefined ? Math.min(1, volume) : 1;
      const audio = playAudio(url, undefined, id);
      audio.volume = previewVol;
    }}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        isPlaying ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
          : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
      }`}>
      {isPlaying ? "Stop" : "Preview"}
    </button>
  );
}

function AutoAddAllButton() {
  const analysis = useSoundStore((s) => s.analysis);
  const generated = useSoundStore((s) => s.generated);
  const addRegion = useMixerStore((s) => s.addRegion);
  const segments = useProjectStore((s) => s.segments);
  const segmentAudioUrls = useProjectStore((s) => s.segmentAudioUrls);

  const hasGenerated = Object.keys(generated).some((id) => generated[id]?.blobUrl);

  return (
    <button onClick={async () => {
      if (!analysis) return;
      // Ensure mixer segments are loaded (needed for auto-placement positions)
      await ensureMixerSegmentsLoaded(segmentAudioUrls, segments);
      const mixerSegments = useMixerStore.getState().segments;
      const textMap: Record<string, string> = {};
      for (const s of segments) textMap[s.id] = s.voiceText;
      const regions = autoPlaceAll(analysis, mixerSegments, textMap);
      // Fill in peaks + clip duration from generated audio
      for (const r of regions) {
        const baseId = r.id.replace(/^auto-/, "").replace(/-p\d+$/, "");
        const gen = generated[baseId];
        if (gen?.peaks?.length) r.peaks = gen.peaks;
        if (gen?.durationMs) r.clipDurationMs = gen.durationMs;
      }
      for (const r of regions) addRegion(r);
    }}
      disabled={!hasGenerated}
      className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-40">
      Add All to Mixer
    </button>
  );
}

function GenerateAllButton({ tab }: { tab: "music" | "sfx" }) {
  const analysis = useSoundStore((s) => s.analysis);
  const generated = useSoundStore((s) => s.generated);
  const setGenerated = useSoundStore((s) => s.setGenerated);
  const setGenerating = useSoundStore((s) => s.setGenerating);
  const [running, setRunning] = useState(false);

  if (!analysis) return null;

  const items = tab === "music" ? analysis.music : analysis.sfx;
  const ungenerated = items.filter((item) => !generated[item.id]?.blobUrl);

  async function handleGenerateAll() {
    setRunning(true);
    for (const item of items) {
      // Check fresh state — skip already generated
      const current = useSoundStore.getState().generated[item.id];
      if (current?.blobUrl) continue;

      useSoundStore.getState().setGenerating(item.id, true);
      try {
        const dur = "durationSec" in item ? item.durationSec : 18;
        const blob = tab === "music"
          ? await generateMusic(item.prompt, dur)
          : await generateSFX(item.prompt, dur, { promptInfluence: 0.7 });
        const url = URL.createObjectURL(blob);
        const buf = await blob.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf);
        const peaks = computePeaks(decoded.getChannelData(0), Math.round(decoded.duration * 50));
        await ctx.close();
        useSoundStore.getState().setGenerated(item.id, { blobUrl: url, peaks, durationMs: decoded.duration * 1000, generating: false });
      } catch {
        useSoundStore.getState().setGenerating(item.id, false);
      }
    }
    setRunning(false);
  }

  if (ungenerated.length === 0) return null;

  return (
    <button onClick={handleGenerateAll} disabled={running}
      className="flex-1 rounded-lg bg-[var(--color-primary)] px-2 py-1.5 text-xs font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
      {running ? "Generating..." : `Generate All (${ungenerated.length})`}
    </button>
  );
}

function AddToMixerButton({ suggestionId, type, segmentAudioUrls: _urls }: { suggestionId: string; type: "music" | "sfx"; segmentAudioUrls?: Record<string, string> }) {
  const analysis = useSoundStore((s) => s.analysis);
  const generated = useSoundStore((s) => s.generated);
  const addRegion = useMixerStore((s) => s.addRegion);
  const segments = useProjectStore((s) => s.segments);
  const segmentAudioUrls = useProjectStore((s) => s.segmentAudioUrls);

  return (
    <button onClick={async () => {
      if (!analysis) return;
      await ensureMixerSegmentsLoaded(segmentAudioUrls, segments);
      const mixerSegments = useMixerStore.getState().segments;
      const textMap: Record<string, string> = {};
      for (const s of segments) textMap[s.id] = s.voiceText;
      const allRegions = autoPlaceAll(analysis, mixerSegments, textMap);
      const matching = allRegions.filter((r) => r.id.includes(suggestionId));
      const gen = generated[suggestionId];
      for (const r of matching) {
        if (gen?.peaks?.length) r.peaks = gen.peaks;
        if (gen?.durationMs) r.clipDurationMs = gen.durationMs;
        addRegion(r);
      }
    }}
      className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]">
      + Mixer
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getAffectedSegmentIds(
  placements: { startSegment: string; endSegment: string }[],
  segments: { id: string }[],
): string[] {
  const ids: string[] = [];
  for (const p of placements) {
    const startIdx = segments.findIndex((s) => s.id === p.startSegment);
    const endIdx = segments.findIndex((s) => s.id === p.endSegment);
    if (startIdx < 0) continue;
    const end = endIdx >= 0 ? endIdx : startIdx;
    for (let i = startIdx; i <= end; i++) ids.push(segments[i].id);
  }
  return ids;
}
