import { useCallback, useEffect, useRef } from "react";
import { useMixerStore, msToPixels, pixelsToMs } from "../stores/mixer-store";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { useProjectStore } from "../stores/project-store";
import { seekPlayback, togglePlayback, stopPlayback } from "../utils/mixer-playback";
import { ensureMixerSegmentsLoaded } from "../utils/load-mixer-segments";
import MixerToolbar from "./MixerToolbar";
import MixerRuler from "./MixerRuler";
import MixerTrack from "./MixerTrack";
import SegmentSettingsPanel from "./SegmentSettingsPanel";

interface Props {
  segmentAudioUrls: Record<string, string>;
  segments: { id: string; speaker: string; voiceText: string }[];
  allSpeakers: string[];
  onClose: () => void;
}

export default function AudioMixerView({ segmentAudioUrls, segments, allSpeakers, onClose }: Props) {
  const mixerSegments = useMixerStore((s) => s.segments);
  const zoom = useMixerStore((s) => s.zoom);
  const setZoom = useMixerStore((s) => s.setZoom);
  const scrollLeft = useMixerStore((s) => s.scrollLeft);
  const setScrollLeft = useMixerStore((s) => s.setScrollLeft);
  const scrollRef = useRef<HTMLDivElement>(null);
  const setSegments = useMixerStore((s) => s.setSegments);
  const settingsState = useSegmentSettingsStore((s) => s.settings);
  const loaded = useRef(false);

  // Recalculate offsets and durations when settings change (gap, earlyStop)
  useEffect(() => {
    if (mixerSegments.length === 0) return;
    let offsetMs = 0;
    const updated = mixerSegments.map((seg) => {
      const ss = settingsState[seg.id];
      const gap = ss?.audio.gapBeforeMs.value ?? seg.gapBeforeMs;
      const earlyStop = ss?.audio.earlyStopMs.value ?? 0;
      const durationMs = Math.max(0, seg.rawDurationMs - earlyStop);
      offsetMs += gap;
      const result = { ...seg, offsetMs, gapBeforeMs: gap, durationMs };
      offsetMs += durationMs;
      return result;
    });
    if (updated.some((u, i) => u.offsetMs !== mixerSegments[i].offsetMs || u.durationMs !== mixerSegments[i].durationMs)) {
      setSegments(updated);
    }
  }, [settingsState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load segments (shared loader — idempotent, reusable from sidebar)
  useEffect(() => {
    if (loaded.current || mixerSegments.length > 0) return;
    loaded.current = true;
    ensureMixerSegmentsLoaded(segmentAudioUrls, segments);
  }, [segments, segmentAudioUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom with Ctrl+scroll — must use native listener for { passive: false }
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const store = useMixerStore.getState();
        const mouseMs = pixelsToMs(mouseX + store.scrollLeft, store.zoom);

        const newZoom = e.deltaY < 0 ? store.zoom * 1.2 : store.zoom / 1.2;
        store.setZoom(newZoom);

        const clampedZoom = Math.max(0.5, Math.min(500, newZoom));
        store.setScrollLeft(msToPixels(mouseMs, clampedZoom) - mouseX);
      } else {
        const store = useMixerStore.getState();
        store.setScrollLeft(store.scrollLeft + e.deltaX + e.deltaY);
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Touch: single-finger pan (with tap threshold), two-finger pinch-zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const PAN_THRESHOLD = 8; // px — movement below this is treated as a tap
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartScrollLeft = 0;
    let isPanning = false;
    let initialPinchDist = 0;
    let initialPinchZoom = 0;

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartScrollLeft = useMixerStore.getState().scrollLeft;
        isPanning = false;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        isPanning = false;
        initialPinchDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        initialPinchZoom = useMixerStore.getState().zoom;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 1 && initialPinchDist === 0) {
        const dx = touchStartX - e.touches[0].clientX;
        const dy = touchStartY - e.touches[0].clientY;
        // Only start panning after exceeding threshold (horizontal bias)
        if (!isPanning && Math.abs(dx) > PAN_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          isPanning = true;
        }
        if (isPanning) {
          e.preventDefault();
          useMixerStore.getState().setScrollLeft(touchStartScrollLeft + dx);
        }
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        if (initialPinchDist > 0) {
          const scale = dist / initialPinchDist;
          useMixerStore.getState().setZoom(initialPinchZoom * scale);
        }
      }
    }

    function handleTouchEnd() {
      initialPinchDist = 0;
      isPanning = false;
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      <MixerToolbar segmentUrls={segmentAudioUrls} onClose={onClose} />
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden"
      >
        <MixerRuler onSeek={(ms) => seekPlayback(segmentAudioUrls, ms)} />
        <MixerTrack label="Speakers" trackType="speakers" allSpeakers={allSpeakers} height={80} />
        <MixerTrack label="Noise" trackType="noise" allSpeakers={allSpeakers} height={32} />
        <MixerTrack label="Music" trackType="music" allSpeakers={allSpeakers} height={48} />
        <MixerTrack label="SFX" trackType="sfx" allSpeakers={allSpeakers} height={48} />
      </div>
      {/* Horizontal scrollbar */}
      <HorizontalScrollbar />
      {/* Selection detail panel */}
      <MixerSelectionPanel />
    </div>
  );
}

/** Compact mobile transport: play/pause, time, close. Timeline hidden. */
function MobileMixerBar({ segmentUrls, onClose }: { segmentUrls: Record<string, string>; onClose: () => void }) {
  const playbackState = useMixerStore((s) => s.playbackState);
  const cursorMs = useMixerStore((s) => s.cursorMs);
  const setCursorMs = useMixerStore((s) => s.setCursorMs);
  const totalDurationMs = useMixerStore((s) => s.totalDurationMs);
  const loading = useMixerStore((s) => s.loading);
  const isPlaying = playbackState === "playing";

  const fmt = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 sm:hidden">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">Mixer</span>
      <button
        onClick={() => { stopPlayback(); setCursorMs(0); }}
        className="rounded p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        title="Restart"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="3" height="16" /><polygon points="20,4 9,12 20,20" />
        </svg>
      </button>
      <button
        onClick={() => togglePlayback(segmentUrls)}
        disabled={loading}
        className={`rounded p-2 transition-colors ${
          isPlaying
            ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        }`}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>
      <span className="font-mono text-xs text-[var(--color-text-secondary)]">
        {fmt(cursorMs)} / {fmt(totalDurationMs)}
      </span>
      {loading && (
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      )}
      <button
        onClick={onClose}
        className="ml-auto rounded p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function RegionEditPanel({ regionId }: { regionId: string }) {
  const region = useMixerStore((s) => s.regions.find((r) => r.id === regionId));
  const updateRegion = useMixerStore((s) => s.updateRegion);
  const removeRegion = useMixerStore((s) => s.removeRegion);

  if (!region) return null;

  const endMs = region.offsetMs + region.durationMs;

  return (
    <div className="border-t border-[var(--color-border)] px-4 py-3">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          region.trackId === "music"
            ? "bg-[var(--color-origin-analyzed-bg)] text-[var(--color-origin-analyzed)]"
            : "bg-[var(--color-origin-user-bg)] text-[var(--color-origin-user)]"
        }`}>
          {region.trackId === "music" ? "Music" : "SFX"}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">{region.id}</span>
        <button onClick={() => removeRegion(region.id)}
          className="ml-auto rounded p-1 text-[var(--color-danger)] hover:bg-[var(--color-surface)]" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>

      {/* Position & timing */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <MsInput label="Start" value={region.offsetMs} onChange={(v) => updateRegion(region.id, { offsetMs: v })} />
        <MsInput label="End" value={endMs} onChange={(v) => updateRegion(region.id, { durationMs: Math.max(100, v - region.offsetMs) })} />
        <MsInput label="Duration" value={region.durationMs} onChange={(v) => updateRegion(region.id, { durationMs: Math.max(100, v) })} />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <>
            <label className="mb-0.5 block text-[10px] text-[var(--color-text-muted)]">Volume ({Math.round(region.volume * 100)}%)</label>
            <input type="range" min="0" max="0.20" step="0.005" value={region.volume}
              aria-label="Volume"
              onChange={(e) => updateRegion(region.id, { volume: parseFloat(e.target.value) })}
              className="h-6 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-slider-track)]" />
          </>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[var(--color-text-muted)]">Loop</label>
          <button onClick={() => {
            const clipMs = region.clipDurationMs ?? region.durationMs;
            const fullMs = region.placementDurationMs ?? region.durationMs;
            if (!region.loop) {
              // Restore full placement span
              updateRegion(region.id, { loop: true, durationMs: fullMs });
            } else {
              // Shrink to actual clip duration
              updateRegion(region.id, { loop: false, durationMs: clipMs });
            }
          }}
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
              region.loop ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
            }`}>
            {region.loop ? "On" : "Off"}
          </button>
        </div>

        <div>
          <label className="mb-0.5 block text-[10px] text-[var(--color-text-muted)]">Fade In ({((region.fadeInMs ?? 0) / 1000).toFixed(1)}s)</label>
          <input type="range" min="0" max="5000" step="250" value={region.fadeInMs ?? 0}
            aria-label="Fade in"
            onChange={(e) => updateRegion(region.id, { fadeInMs: parseInt(e.target.value) })}
            className="h-6 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-slider-track)]" />
        </div>

        <div>
          <label className="mb-0.5 block text-[10px] text-[var(--color-text-muted)]">Fade Out ({((region.fadeOutMs ?? 0) / 1000).toFixed(1)}s)</label>
          <input type="range" min="0" max="5000" step="250" value={region.fadeOutMs ?? 0}
            aria-label="Fade out"
            onChange={(e) => updateRegion(region.id, { fadeOutMs: parseInt(e.target.value) })}
            className="h-6 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-slider-track)]" />
        </div>
      </div>

      {region.prompt && (
        <div className="mt-2 rounded bg-[var(--color-bg)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)]">{region.prompt}</div>
      )}
    </div>
  );
}

function MsInput({ label, value, onChange, readOnly }: { label: string; value: number; onChange?: (ms: number) => void; readOnly?: boolean }) {
  const sec = (value / 1000).toFixed(2);
  const inputId = `ms-input-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-0.5 block text-[10px] text-[var(--color-text-muted)]">{label}</label>
      <input
        id={inputId}
        type="text"
        value={`${sec}s`}
        readOnly={readOnly}
        onChange={(e) => {
          if (!onChange) return;
          const num = parseFloat(e.target.value.replace("s", ""));
          if (!isNaN(num)) onChange(Math.round(num * 1000));
        }}
        onBlur={(e) => {
          if (!onChange) return;
          const num = parseFloat(e.target.value.replace("s", ""));
          if (!isNaN(num)) onChange(Math.round(num * 1000));
        }}
        className={`w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text)] ${
          readOnly ? "opacity-60" : "focus:border-[var(--color-primary)] focus:outline-none"
        }`}
      />
    </div>
  );
}

function MixerSelectionPanel() {
  const selectedSegmentId = useMixerStore((s) => s.selectedSegmentId);
  const selectedRegionId = useMixerStore((s) => s.selectedRegionId);
  const regions = useMixerStore((s) => s.regions);
  const segments = useMixerStore((s) => s.segments);
  const projectSegments = useProjectStore((s) => s.segments);

  if (selectedSegmentId) {
    const seg = segments.find((s) => s.id === selectedSegmentId);
    const projectSeg = projectSegments.find((s) => s.id === selectedSegmentId);
    return (
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">{seg?.speaker}</span>
          <span>{selectedSegmentId}</span>
        </div>
        {projectSeg && (
          <div className="mb-2 space-y-1">
            <div className="rounded bg-[var(--color-bg)] px-2 py-1.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {projectSeg.voiceText}
            </div>
            {projectSeg.originalText !== projectSeg.voiceText && (
              <div className="rounded bg-[var(--color-bg)] px-2 py-1 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
                <span className="font-medium">Original: </span>{projectSeg.originalText}
              </div>
            )}
          </div>
        )}
        {seg && (
          <div className="mb-2 grid grid-cols-3 gap-2">
            <MsInput label="Start" value={seg.offsetMs} readOnly />
            <MsInput label="End" value={seg.offsetMs + seg.durationMs} readOnly />
            <MsInput label="Duration" value={seg.durationMs} readOnly />
          </div>
        )}
        <SegmentSettingsPanel segmentId={selectedSegmentId} audioDuration={seg ? seg.durationMs / 1000 : undefined} />
      </div>
    );
  }

  if (selectedRegionId) {
    return <RegionEditPanel regionId={selectedRegionId} />;
  }

  return null;
}

function HorizontalScrollbar() {
  const scrollLeft = useMixerStore((s) => s.scrollLeft);
  const setScrollLeft = useMixerStore((s) => s.setScrollLeft);
  const zoom = useMixerStore((s) => s.zoom);
  const totalDurationMs = useMixerStore((s) => s.totalDurationMs);
  const trackRef = useRef<HTMLDivElement>(null);

  const totalWidth = msToPixels(totalDurationMs + 2000, zoom);
  const viewportWidth = 800;
  const maxScroll = Math.max(0, totalWidth - viewportWidth);
  const trackW = trackRef.current?.clientWidth ?? viewportWidth;
  const thumbWidth = Math.max(40, (viewportWidth / Math.max(totalWidth, 1)) * trackW);
  const thumbLeft = maxScroll > 0 ? (scrollLeft / maxScroll) * (trackW - thumbWidth) : 0;

  function scrollFromX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left - thumbWidth / 2) / (rect.width - thumbWidth)));
    setScrollLeft(frac * maxScroll);
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    scrollFromX(e.clientX);

    function onMove(ev: MouseEvent) { scrollFromX(ev.clientX); }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    scrollFromX(e.touches[0].clientX);
  }

  function handleTouchMove(e: React.TouchEvent) {
    scrollFromX(e.touches[0].clientX);
  }

  return (
    <div
      ref={trackRef}
      className="relative ml-20 flex h-5 cursor-pointer items-center border-t border-[var(--color-border)]/30 sm:h-3"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div
        className="absolute top-0.5 h-2 rounded-full bg-[var(--color-text-muted)]/30 hover:bg-[var(--color-text-muted)]/50"
        style={{ left: thumbLeft, width: thumbWidth }}
      />
    </div>
  );
}
