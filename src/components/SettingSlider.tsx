import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { TrackedValue, SettingOrigin } from "../types/segment-settings";

const ORIGIN_LABELS: Record<SettingOrigin, string> = {
  default: "Default",
  analyzed: "AI",
  user: "Custom",
};

interface Props {
  label: string;
  description?: string;
  tracked: TrackedValue<number>;
  min: number;
  max: number;
  step: number;
  unit: string;
  readOnly?: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}

export default function SettingSlider({ label, description, tracked: tv, min, max, step, unit, readOnly, onChange, onReset }: Props) {
  const isModified = tv.origin !== "default";
  const originColor = `var(--color-origin-${tv.origin})`;
  const [editing, setEditing] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  const infoRef = useRef<SVGSVGElement>(null);

  const showTooltip = useCallback(() => {
    if (!infoRef.current) return;
    const rect = infoRef.current.getBoundingClientRect();
    const flip = rect.top < 120; // flip below if too close to top
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: flip ? rect.bottom + 6 : rect.top - 6,
      flip,
    });
  }, []);
  const hideTooltip = useCallback(() => setTooltipPos(null), []);

  function commitEdit(raw: string) {
    const num = parseFloat(raw);
    if (!isNaN(num)) onChange(Math.max(min, Math.min(max, num)));
    setEditing(false);
  }

  return (
    <div className="group relative flex min-w-0 items-center gap-2 py-1 sm:min-w-[340px] sm:gap-3" title={readOnly ? "Editable in production mode" : undefined}>
      {/* Label + info icon */}
      <span className="flex w-20 shrink-0 items-center gap-1 text-xs text-[var(--color-text-muted)] sm:w-28">
        {label}
        {description && (
          <span className="relative inline-flex">
            <svg ref={infoRef} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="cursor-help text-[var(--color-text-muted)]/50 hover:text-[var(--color-text-secondary)]"
              onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            {tooltipPos && createPortal(
              <div
                className="pointer-events-none fixed z-[101] w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-xs leading-relaxed text-[var(--color-text)] shadow-lg"
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                  transform: `translateX(-50%) ${tooltipPos.flip ? "" : "translateY(-100%)"}`,
                }}
              >
                {description}
              </div>,
              document.body,
            )}
          </span>
        )}
      </span>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={tv.value}
        disabled={readOnly}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className={`h-6 flex-1 cursor-pointer appearance-none rounded-full ${readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        style={{
          background: `linear-gradient(to right, ${originColor} 0%, ${originColor} ${((tv.value - min) / (max - min)) * 100}%, var(--color-slider-track) ${((tv.value - min) / (max - min)) * 100}%, var(--color-slider-track) 100%)`,
          accentColor: originColor,
        }}
      />

      {/* Value — click to edit */}
      {editing && !readOnly ? (
        <input
          autoFocus
          type="number"
          min={min}
          max={max}
          step={step}
          defaultValue={tv.value}
          aria-label={label}
          onBlur={(e) => commitEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-16 shrink-0 rounded border border-[var(--color-primary)] bg-[var(--color-input-bg)] px-2 py-0.5 text-right font-mono text-xs text-[var(--color-text)] focus:outline-none"
        />
      ) : (
        <button
          onClick={() => { if (!readOnly) setEditing(true); }}
          disabled={readOnly}
          className={`w-16 shrink-0 text-right font-mono text-xs ${
            readOnly ? "text-[var(--color-text-secondary)]" : "cursor-text text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          }`}
        >
          {tv.value}{unit}
        </button>
      )}

      {/* Origin badge */}
      <span
        className="w-14 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium"
        style={{
          backgroundColor: `var(--color-origin-${tv.origin}-bg)`,
          color: originColor,
        }}
      >
        {ORIGIN_LABELS[tv.origin]}
      </span>

      {/* Reset button (visible on hover if modified and editable) */}
      {isModified && !readOnly ? (
        <button
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          className="w-5 shrink-0 cursor-pointer text-[var(--color-text-muted)] opacity-0 transition-opacity hover:text-[var(--color-text)] group-hover:opacity-100"
          title={`Reset to ${tv.analyzedValue !== undefined ? `AI optimized (${tv.analyzedValue}${unit})` : `${tv.defaultValue}${unit}`}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
    </div>
  );
}
