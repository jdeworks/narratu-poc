import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMixerStore, msToPixels, pixelsToMs, type MixerRegion } from "../stores/mixer-store";
import { useSoundStore } from "../stores/sound-store";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { DEFAULT_CONFIG } from "../engine/audio-processor";
import { getSpeakerColor } from "../utils/speaker-colors";
import MixerRegionPanel from "./MixerRegionPanel";

interface Props {
  label: string;
  trackType: "speakers" | "noise" | "music" | "sfx";
  allSpeakers: string[];
  height?: number;
}

export default function MixerTrack({ label, trackType, allSpeakers, height = 64 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segments = useMixerStore((s) => s.segments);
  const regions = useMixerStore((s) => s.regions);
  const zoom = useMixerStore((s) => s.zoom);
  const scrollLeft = useMixerStore((s) => s.scrollLeft);
  const totalDurationMs = useMixerStore((s) => s.totalDurationMs);
  const selectedSegmentId = useMixerStore((s) => s.selectedSegmentId);
  const cursorMs = useMixerStore((s) => s.cursorMs);
  const selectSegment = useMixerStore((s) => s.selectSegment);
  const setCursorMs = useMixerStore((s) => s.setCursorMs);

  const settingsState = useSegmentSettingsStore((s) => s.settings);
  const totalWidth = msToPixels(totalDurationMs + 2000, zoom); // +2s padding

  // Render waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (trackType === "speakers") {
      drawSpeakerTrack(ctx, w, h, segments, zoom, scrollLeft, allSpeakers, selectedSegmentId, settingsState);
    } else if (trackType === "noise") {
      drawNoiseTrack(ctx, w, h, segments, zoom, scrollLeft);
    } else {
      drawRegionTrack(ctx, w, h, regions.filter((r) => r.trackId === trackType), zoom, scrollLeft);
    }

    // Cursor line
    const waveCursor = getComputedStyle(document.documentElement).getPropertyValue("--color-wave-cursor").trim();
    const cursorX = msToPixels(cursorMs, zoom) - scrollLeft;
    if (cursorX >= 0 && cursorX <= w) {
      ctx.strokeStyle = waveCursor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();
    }
  }, [segments, regions, zoom, scrollLeft, height, trackType, allSpeakers, selectedSegmentId, cursorMs, settingsState]);

  // ── Drag handling ─────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{ id: string; type: "segment" | "region"; startX: number; startGapOrOffset: number } | null>(null);
  const setAudioOverride = useSegmentSettingsStore((s) => s.setAudioOverride);
  const moveRegion = useMixerStore((s) => s.moveRegion);
  const selectRegion = useMixerStore((s) => s.selectRegion);
  const splitRegion = useMixerStore((s) => s.splitRegion);
  const removeRegion = useMixerStore((s) => s.removeRegion);
  const [contextMenu, setContextMenu] = useState<{
    pageX: number; pageY: number; clickMs: number;
    target: { type: "segment"; id: string } | { type: "region"; id: string } | { type: "empty" };
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickMs = pixelsToMs(e.clientX - rect.left + scrollLeft, zoom);

    if (trackType === "speakers") {
      const seg = segments.find((s) => clickMs >= s.offsetMs && clickMs <= s.offsetMs + s.durationMs);
      selectSegment(seg?.id ?? null);
      if (seg) {
        setDragging({ id: seg.id, type: "segment", startX: e.clientX, startGapOrOffset: seg.gapBeforeMs });
        return;
      }
    } else if (trackType === "music" || trackType === "sfx") {
      const region = regions.filter((r) => r.trackId === trackType)
        .find((r) => clickMs >= r.offsetMs && clickMs <= r.offsetMs + r.durationMs);
      if (region) {
        selectRegion(region.id);
        setDragging({ id: region.id, type: "region", startX: e.clientX, startGapOrOffset: region.offsetMs });
        return;
      }
      selectRegion(null);
    }
    setCursorMs(Math.max(0, clickMs));
  }

  useEffect(() => {
    if (!dragging) return;

    function onMouseMove(e: MouseEvent) {
      if (!dragging) return;
      const deltaPixels = e.clientX - dragging.startX;
      const deltaMs = pixelsToMs(Math.abs(deltaPixels), zoom) * Math.sign(deltaPixels);

      if (dragging.type === "segment") {
        const newGap = Math.max(0, dragging.startGapOrOffset + deltaMs);
        setAudioOverride(dragging.id, "gapBeforeMs", Math.round(newGap));
      } else if (dragging.type === "region") {
        const newOffset = Math.max(0, dragging.startGapOrOffset + deltaMs);
        moveRegion(dragging.id, Math.round(newOffset));
      }
    }

    function onMouseUp() {
      setDragging(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, segments, zoom, setAudioOverride]);

  // ── Keyboard ─────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!selectedSegmentId || trackType !== "speakers") return;
    const nudgeMs = 50;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const seg = segments.find((s) => s.id === selectedSegmentId);
      if (seg) {
        const delta = e.key === "ArrowRight" ? nudgeMs : -nudgeMs;
        const newGap = Math.max(0, seg.gapBeforeMs + delta);
        setAudioOverride(selectedSegmentId, "gapBeforeMs", Math.round(newGap));
      }
    }
  }

  const [dropHighlight, setDropHighlight] = useState(false);
  const addRegion = useMixerStore((s) => s.addRegion);

  function handleDragOver(e: React.DragEvent) {
    if (trackType !== "music" && trackType !== "sfx") return;
    if (!e.dataTransfer.types.includes("application/narratu-sound")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropHighlight(true);
  }

  function handleDrop(e: React.DragEvent) {
    setDropHighlight(false);
    if (trackType !== "music" && trackType !== "sfx") return;
    const raw = e.dataTransfer.getData("application/narratu-sound");
    if (!raw) return;
    e.preventDefault();
    try {
      const { id, type } = JSON.parse(raw) as { id: string; type: "music" | "sfx" };
      if (type !== trackType) return; // Only accept matching track type
      const rect = e.currentTarget.getBoundingClientRect();
      const dropMs = pixelsToMs(e.clientX - rect.left + scrollLeft, zoom);
      const gen = useSoundStore.getState().generated[id];
      const analysis = useSoundStore.getState().analysis;
      const suggestion = type === "music"
        ? analysis?.music.find((m) => m.id === id)
        : analysis?.sfx.find((s) => s.id === id);
      if (!suggestion) return;
      const durationMs = gen?.durationMs ?? ("durationSec" in suggestion ? suggestion.durationSec * 1000 : 15000);
      const region: MixerRegion = {
        id: `drop-${id}-${Date.now()}`,
        trackId: type,
        offsetMs: Math.max(0, dropMs),
        durationMs,
        clipDurationMs: gen?.durationMs,
        peaks: gen?.peaks ?? [],
        volume: suggestion.volume,
        loop: type === "music",
        source: type === "music" ? "elevenlabs-music" : "elevenlabs-sfx",
        prompt: suggestion.prompt,
      };
      addRegion(region);
      selectRegion(region.id);
    } catch { /* ignore invalid drag data */ }
  }

  const isEmpty = trackType === "music" || trackType === "sfx"
    ? regions.filter((r) => r.trackId === trackType).length === 0
    : false;

  return (
    <div
      className={`flex items-stretch overflow-hidden border-b border-[var(--color-border)]/30 ${isEmpty && !dropHighlight ? "opacity-50" : ""} ${dropHighlight ? "ring-2 ring-inset ring-[var(--color-primary)]/40" : ""}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropHighlight(false)}
      onDrop={handleDrop}
    >
      {/* Track label + controls */}
      <div className="flex w-20 shrink-0 flex-col items-start justify-center border-r border-[var(--color-border)]/30 px-2">
        <span className="text-[10px] font-medium text-[var(--color-text-muted)]">{label}</span>
        {(trackType === "music" || trackType === "sfx") && (
          <MixerRegionPanel trackId={trackType} />
        )}
      </div>
      {/* Canvas — always viewport-sized, scrollLeft offsets the draw */}
      <div className="relative flex-1 overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          className={`absolute left-0 top-0 w-full ${dragging ? "cursor-grabbing" : "cursor-crosshair"}`}
          style={{ height }}
          onMouseDown={handleMouseDown}
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const clickMs = pixelsToMs(e.clientX - rect.left + scrollLeft, zoom);
            const pos = { pageX: e.pageX, pageY: e.pageY, clickMs };

            if (trackType === "speakers") {
              const seg = segments.find((s) => clickMs >= s.offsetMs && clickMs <= s.offsetMs + s.durationMs);
              if (seg) { setContextMenu({ ...pos, target: { type: "segment", id: seg.id } }); return; }
            }
            if (trackType === "music" || trackType === "sfx") {
              const region = regions.filter((r) => r.trackId === trackType)
                .find((r) => clickMs >= r.offsetMs && clickMs <= r.offsetMs + r.durationMs);
              if (region) { setContextMenu({ ...pos, target: { type: "region", id: region.id } }); return; }
            }
            setContextMenu({ ...pos, target: { type: "empty" } });
          }}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--color-text-muted)]">
            Empty — drag or generate audio
          </div>
        )}
        {/* Context menu — rendered via portal to avoid overflow clipping */}
        {contextMenu && createPortal(
          <>
            {/* Backdrop to close on click outside */}
            <div className="fixed inset-0 z-[100]" onClick={() => setContextMenu(null)} />
            <div className="fixed z-[101] min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-xl"
              style={{ left: contextMenu.pageX, top: contextMenu.pageY }}>

              {contextMenu.target.type === "segment" && (
                <CtxBtn label="Select segment" onClick={() => { selectSegment(contextMenu.target.type === "segment" ? contextMenu.target.id : null); setContextMenu(null); }} />
              )}

              {contextMenu.target.type === "region" && (
                <>
                  <CtxBtn label="Select" onClick={() => { selectRegion(contextMenu.target.type === "region" ? contextMenu.target.id : null); setContextMenu(null); }} />
                  <CtxBtn label="Split here" onClick={() => { splitRegion(contextMenu.target.type === "region" ? contextMenu.target.id : "", contextMenu.clickMs); setContextMenu(null); }} />
                  <CtxBtn label="Delete" danger onClick={() => { removeRegion(contextMenu.target.type === "region" ? contextMenu.target.id : ""); setContextMenu(null); }} />
                </>
              )}

              <CtxBtn label="Set cursor here" onClick={() => { setCursorMs(contextMenu.clickMs); setContextMenu(null); }} />
            </div>
          </>,
          document.body,
        )}
      </div>
    </div>
  );
}

// ── Drawing functions ────────────────────────────────────────────────────

function drawSpeakerTrack(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  segments: import("../stores/mixer-store").MixerSegment[],
  zoom: number, scrollLeft: number, allSpeakers: string[], selectedId: string | null,
  settingsState: Record<string, { audio: import("../types/segment-settings").SegmentAudioSettings }>,
) {
  const mid = h / 2;
  const defaultLufs = DEFAULT_CONFIG.targetLufs;

  for (const seg of segments) {
    const x = msToPixels(seg.offsetMs, zoom) - scrollLeft;
    const segW = msToPixels(seg.durationMs, zoom);
    if (x + segW < 0 || x > w) continue; // off-screen

    const color = getSpeakerColor(seg.speaker, allSpeakers);
    const isSelected = seg.id === selectedId;

    // Get audio processing settings for visual transforms
    const ss = settingsState[seg.id]?.audio;
    const lufsScale = ss ? Math.pow(10, (ss.targetLufs.value - defaultLufs) / 20) : 1;
    const fadeInMs = ss?.fadeInMs.value ?? DEFAULT_CONFIG.fadeInMs;
    const fadeOutMs = ss?.fadeOutMs.value ?? DEFAULT_CONFIG.fadeOutMs;
    const fadeInStrength = (ss?.fadeInStrength.value ?? 50) / 100;
    const fadeOutStrength = (ss?.fadeOutStrength.value ?? 50) / 100;
    // How many peaks to draw (truncate for earlyStop)
    const keepFrac = seg.rawDurationMs > 0 ? seg.durationMs / seg.rawDurationMs : 1;
    const peakCount = Math.max(1, Math.round(seg.peaks.length * keepFrac));

    if (segW < 3) {
      // Extreme zoom-out: just a colored bar
      ctx.fillStyle = color.border;
      ctx.globalAlpha = isSelected ? 1 : 0.7;
      ctx.fillRect(x, 1, Math.max(segW, 2), h - 2);
      ctx.globalAlpha = 1;
    } else {
      // Background
      ctx.fillStyle = isSelected ? `${color.bg}` : `rgba(${hexToRgbNums(color.border)}, 0.08)`;
      ctx.fillRect(x, 0, segW, h);

      // Waveform peaks with LUFS scaling and fade envelopes
      if (peakCount > 0 && seg.peaks.length > 0) {
        const barW = segW / peakCount;
        ctx.fillStyle = `rgba(${hexToRgbNums(color.border)}, ${isSelected ? 1 : 0.7})`;
        const fadeInFrac = seg.durationMs > 0 ? fadeInMs / seg.durationMs : 0;
        const fadeOutFrac = seg.durationMs > 0 ? fadeOutMs / seg.durationMs : 0;
        const inPow = 1 + fadeInStrength * 2;   // 1.0 → 3.0
        const outPow = 1 + fadeOutStrength * 2;

        for (let i = 0; i < peakCount; i++) {
          let barH = seg.peaks[i] * mid * 0.85 * Math.min(2, Math.max(0.3, lufsScale));

          // Apply fade envelopes visually (matching the processing curve)
          const frac = i / peakCount;
          if (fadeInFrac > 0 && frac < fadeInFrac) {
            barH *= Math.pow(frac / fadeInFrac, inPow);
          }
          if (fadeOutFrac > 0 && frac > 1 - fadeOutFrac) {
            barH *= Math.pow((1 - frac) / fadeOutFrac, outPow);
          }

          ctx.fillRect(x + i * barW, mid - barH, Math.max(barW - 0.5, 0.5), barH * 2);
        }
      }

      // Border
      if (isSelected) {
        ctx.strokeStyle = color.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, 1, segW - 2, h - 2);
      }
    }
  }
}

function drawNoiseTrack(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  segments: { offsetMs: number; durationMs: number; gapBeforeMs: number }[],
  zoom: number, scrollLeft: number,
) {
  const styles = getComputedStyle(document.documentElement);
  const noiseBg = styles.getPropertyValue("--color-wave-noise").trim();
  const noiseBar = styles.getPropertyValue("--color-wave-noise-bar").trim();

  ctx.fillStyle = noiseBg;
  for (const seg of segments) {
    if (seg.gapBeforeMs <= 0) continue;
    const gapStart = msToPixels(seg.offsetMs - seg.gapBeforeMs, zoom) - scrollLeft;
    const gapW = msToPixels(seg.gapBeforeMs, zoom);
    if (gapStart + gapW < 0 || gapStart > w) continue;
    ctx.fillRect(gapStart, 0, gapW, h);

    ctx.fillStyle = noiseBar;
    let seed = Math.round(gapStart * 100);
    for (let x = gapStart; x < gapStart + gapW; x += 3) {
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
      const barH = (seed % 1000) / 1000 * h * 0.3;
      ctx.fillRect(x, h / 2 - barH / 2, 1.5, barH);
    }
    ctx.fillStyle = noiseBg;
  }
}

function drawRegionTrack(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  regions: import("../stores/mixer-store").MixerRegion[],
  zoom: number, scrollLeft: number,
) {
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim();
  const waveFade = getComputedStyle(document.documentElement).getPropertyValue("--color-wave-fade").trim();

  for (const region of regions) {
    const x = msToPixels(region.offsetMs, zoom) - scrollLeft;
    const rW = msToPixels(region.durationMs, zoom);
    if (x + rW < 0 || x > w) continue;

    const vol = region.volume;

    // Region background — opacity scales with volume
    ctx.globalAlpha = 0.08 + vol * 0.15;
    ctx.fillStyle = primaryColor;
    ctx.fillRect(x, 0, rW, h);

    if (region.peaks.length > 0) {
      const maxPeak = Math.max(...region.peaks, 0.01);
      const mid = h / 2;

      // Peaks represent one audio cycle. Bar width is based on clip duration.
      const clipMs = region.clipDurationMs ?? region.durationMs;
      const clipW = msToPixels(clipMs, zoom);
      const naturalBarW = clipW / region.peaks.length;

      // When zoomed out (bars < 1px), use 1px bars and sample peaks accordingly
      const barW = Math.max(1, naturalBarW);
      const totalBars = Math.min(Math.ceil(rW / barW), rW < 3 ? 1 : 2000);

      ctx.fillStyle = primaryColor;
      for (let i = 0; i < totalBars; i++) {
        const px = x + i * barW;
        if (px > x + rW) break;
        if (px + barW < 0) continue;

        // Map pixel position to peak index (handles both tiling and downsampling)
        const posInClip = (i * barW) % clipW;
        const peakIdx = Math.floor((posInClip / clipW) * region.peaks.length) % region.peaks.length;
        const frac = i / totalBars;
        const normalized = region.peaks[peakIdx] / maxPeak;

        // Apply volume scaling to height
        let barH = normalized * mid * 0.85 * vol;

        // Apply fade envelope visually
        const fadeInFrac = region.fadeInMs ? region.fadeInMs / region.durationMs : 0;
        const fadeOutFrac = region.fadeOutMs ? region.fadeOutMs / region.durationMs : 0;
        if (fadeInFrac > 0 && frac < fadeInFrac) barH *= frac / fadeInFrac;
        if (fadeOutFrac > 0 && frac > 1 - fadeOutFrac) barH *= (1 - frac) / fadeOutFrac;

        ctx.globalAlpha = 0.4 + vol * 0.4;
        ctx.fillRect(px, mid - barH, Math.max(barW - 0.5, 0.5), barH * 2);
      }

      // Loop cycle markers (dashed lines at each loop repeat)
      if (region.loop && clipW < rW) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = primaryColor;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        for (let loopX = x + clipW; loopX < x + rW; loopX += clipW) {
          ctx.beginPath();
          ctx.moveTo(loopX, 0);
          ctx.lineTo(loopX, h);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Fade overlay gradients
      if (region.fadeInMs && region.fadeInMs > 0) {
        const fadeW = (region.fadeInMs / region.durationMs) * rW;
        if (fadeW > 2) {
          const grad = ctx.createLinearGradient(x, 0, x + fadeW, 0);
          grad.addColorStop(0, waveFade);
          grad.addColorStop(1, "transparent");
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.fillRect(x, 0, fadeW, h);
        }
      }
      if (region.fadeOutMs && region.fadeOutMs > 0) {
        const fadeW = (region.fadeOutMs / region.durationMs) * rW;
        if (fadeW > 2) {
          const fadeX = x + rW - fadeW;
          const grad = ctx.createLinearGradient(fadeX, 0, x + rW, 0);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, waveFade);
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.fillRect(fadeX, 0, fadeW, h);
        }
      }
    } else {
      // No peaks — placeholder scaled by volume
      ctx.globalAlpha = 0.15 + vol * 0.2;
      ctx.fillRect(x, h * 0.3, rW, h * 0.4);
    }

    // Border
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, 0, rW, h);
    ctx.globalAlpha = 1;
  }
}

function hexToRgbNums(color: string): string {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : "100, 100, 100";
}

function CtxBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-xs hover:bg-[var(--color-surface)] ${
        danger ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"
      }`}>
      {label}
    </button>
  );
}
