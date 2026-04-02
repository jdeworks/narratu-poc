import { useEffect, useRef } from "react";
import { useMixerStore, msToPixels, pixelsToMs } from "../stores/mixer-store";

interface Props {
  onSeek?: (ms: number) => void;
}

export default function MixerRuler({ onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoom = useMixerStore((s) => s.zoom);
  const scrollLeft = useMixerStore((s) => s.scrollLeft);
  const totalDurationMs = useMixerStore((s) => s.totalDurationMs);
  const cursorMs = useMixerStore((s) => s.cursorMs);
  const setCursorMs = useMixerStore((s) => s.setCursorMs);
  const playbackState = useMixerStore((s) => s.playbackState);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = 24;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--color-text-muted").trim() || "#94a3b8";
    const borderColor = styles.getPropertyValue("--color-border").trim() || "#334155";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";

    // Adaptive tick intervals based on zoom level
    const msPerPixel = 1000 / zoom;
    const minPixelsBetweenTicks = 60;
    const minMsBetweenTicks = msPerPixel * minPixelsBetweenTicks;

    // Choose a nice tick interval
    const intervals = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const tickMs = intervals.find((i) => i >= minMsBetweenTicks) ?? 60000;
    const totalMs = totalDurationMs + 2000;

    for (let ms = 0; ms <= totalMs; ms += tickMs) {
      const x = msToPixels(ms, zoom) - scrollLeft;
      if (x < -80 || x > w + 80) continue;

      // Major tick + label
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.moveTo(x, h - 8);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.fillStyle = textColor;
      const totalSec = ms / 1000;
      const mins = Math.floor(totalSec / 60);
      const secs = Math.floor(totalSec % 60);
      const msRem = ms % 1000;
      if (tickMs < 1000) {
        ctx.fillText(`${mins}:${String(secs).padStart(2, "0")}.${String(msRem).padStart(3, "0")}`, x, h - 11);
      } else {
        ctx.fillText(`${mins}:${String(secs).padStart(2, "0")}`, x, h - 11);
      }

      // Sub-ticks (half-way marks)
      if (tickMs >= 500) {
        const halfX = msToPixels(ms + tickMs / 2, zoom) - scrollLeft;
        if (halfX >= 0 && halfX <= w) {
          ctx.strokeStyle = borderColor;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(halfX, h - 4);
          ctx.lineTo(halfX, h);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Cursor marker
    const cursorX = msToPixels(cursorMs, zoom) - scrollLeft;
    if (cursorX >= 0 && cursorX <= w) {
      ctx.fillStyle = styles.getPropertyValue("--color-wave-cursor").trim();
      ctx.beginPath();
      ctx.moveTo(cursorX - 4, h);
      ctx.lineTo(cursorX + 4, h);
      ctx.lineTo(cursorX, h - 6);
      ctx.fill();
    }
  }, [zoom, scrollLeft, totalDurationMs, cursorMs]);

  return (
    <div className="flex items-stretch border-b border-[var(--color-border)]/30 overflow-hidden">
      <div className="w-20 shrink-0 border-r border-[var(--color-border)]/30" />
      <canvas
        ref={canvasRef}
        className="min-w-0 flex-1 cursor-pointer"
        style={{ height: 24 }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickMs = Math.max(0, pixelsToMs(e.clientX - rect.left + scrollLeft, zoom));
          setCursorMs(clickMs);
          // If playing, seek to new position immediately
          if (playbackState === "playing" && onSeek) onSeek(clickMs);
        }}
      />
    </div>
  );
}
