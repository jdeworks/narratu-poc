import { useState } from "react";
import { useMixerStore, msToPixels } from "../stores/mixer-store";
import { togglePlayback, stopPlayback } from "../utils/mixer-playback";

interface Props {
  segmentUrls: Record<string, string>;
  onClose: () => void;
}

export default function MixerToolbar({ segmentUrls, onClose }: Props) {
  const zoom = useMixerStore((s) => s.zoom);
  const setZoom = useMixerStore((s) => s.setZoom);
  const cursorMs = useMixerStore((s) => s.cursorMs);
  const setCursorMs = useMixerStore((s) => s.setCursorMs);
  const loading = useMixerStore((s) => s.loading);
  const loadProgress = useMixerStore((s) => s.loadProgress);
  const playbackState = useMixerStore((s) => s.playbackState);
  const isPlaying = playbackState === "playing";

  const mins = Math.floor(cursorMs / 60000);
  const secs = Math.floor((cursorMs % 60000) / 1000);
  const ms = Math.floor(cursorMs % 1000);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 sm:gap-3 sm:px-4">
      {/* Title */}
      <span className="text-sm font-medium text-[var(--color-text)]">Audio Mixer</span>

      {/* Transport */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { stopPlayback(); setCursorMs(0); useMixerStore.getState().setScrollLeft(0); }}
          className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          title="Jump to start"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="3" height="16" /><polygon points="20,4 9,12 20,20" />
          </svg>
        </button>
        <button
          onClick={() => {
            const store = useMixerStore.getState();
            const cur = store.cursorMs;
            // Collect all start boundaries across all lanes
            const starts: number[] = [0];
            for (const s of store.segments) {
              starts.push(s.offsetMs); // segment start
              if (s.gapBeforeMs > 0) starts.push(s.offsetMs - s.gapBeforeMs); // noise start
            }
            for (const r of store.regions) starts.push(r.offsetMs);
            // Find nearest start strictly before cursor (with 10ms tolerance)
            const before = starts.filter((t) => t < cur - 10).sort((a, b) => b - a);
            const target = before.length > 0 ? before[0] : 0;
            setCursorMs(target);
            // Scroll view to show cursor
            const px = msToPixels(target, store.zoom);
            if (px < store.scrollLeft || px > store.scrollLeft + 800) {
              store.setScrollLeft(Math.max(0, px - 100));
            }
          }}
          className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          title="Previous boundary (any lane)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
        <button
          onClick={() => togglePlayback(segmentUrls)}
          disabled={loading}
          className={`rounded p-1.5 transition-colors ${
            isPlaying
              ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          }`}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          Loading {loadProgress.current}/{loadProgress.total}...
        </span>
      )}

      {/* Cursor position — click to type a time to jump to */}
      <input
        className="ml-auto w-24 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right font-mono text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
        value={`${mins}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`}
        onFocus={(e) => e.target.select()}
        onChange={() => {/* controlled by blur */}}
        onBlur={(e) => {
          const parts = e.target.value.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
          if (parts) {
            const jumpMs = parseInt(parts[1]) * 60000 + parseInt(parts[2]) * 1000 + parseInt(parts[3] ?? "0");
            setCursorMs(jumpMs);
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        title="Click to jump to a time (m:ss.ms)"
      />

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            // Fit entire timeline in viewport (~720px usable)
            const total = useMixerStore.getState().totalDurationMs;
            if (total > 0) { setZoom(720 / (total / 1000)); useMixerStore.getState().setScrollLeft(0); }
          }}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          title="Fit entire timeline in view"
        >
          Fit
        </button>
        <button onClick={() => setZoom(zoom / 1.5)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M8 11h6" />
          </svg>
        </button>
        <input
          type="range"
          min="0.5"
          max="500"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="hidden h-1 w-24 cursor-pointer appearance-none rounded-full bg-[var(--color-slider-track)] sm:block"
        />
        <button onClick={() => setZoom(zoom * 1.5)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" />
          </svg>
        </button>
        <span className="hidden w-12 text-center text-[10px] text-[var(--color-text-muted)] sm:inline">{Math.round(zoom / 50 * 100)}%</span>
      </div>

      {/* Close */}
      <button
        onClick={onClose}
        className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
