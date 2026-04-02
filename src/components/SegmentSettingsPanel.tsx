import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { SETTING_META } from "../engine/audio-processor";
import type { SegmentAudioSettings } from "../types/segment-settings";
import SettingSlider from "./SettingSlider";

interface Props {
  segmentId: string;
  audioDuration?: number;
  readOnly?: boolean;
}

const CATEGORIES = [
  { key: "timing" as const, label: "Timing" },
  { key: "levels" as const, label: "Levels" },
  { key: "fades" as const, label: "Fades" },
];

export default function SegmentSettingsPanel({ segmentId, audioDuration, readOnly }: Props) {
  const settings = useSegmentSettingsStore((s) => s.settings[segmentId]);
  const setOverride = useSegmentSettingsStore((s) => s.setAudioOverride);
  const clearOverride = useSegmentSettingsStore((s) => s.clearAudioOverride);

  if (!settings) {
    return (
      <div className="rounded-lg bg-[var(--color-panel-bg)] p-3">
        <p className="text-xs text-[var(--color-text-muted)]">Settings not initialized</p>
      </div>
    );
  }

  const { audio } = settings;
  const overrideCount = Object.values(audio).filter((tv) => tv.origin !== "default").length;
  const hasUserOverrides = Object.values(audio).some((tv) => tv.origin === "user");

  function resetAllToAnalyzed() {
    for (const key of Object.keys(audio) as (keyof SegmentAudioSettings)[]) {
      if (audio[key].origin === "user") {
        clearOverride(segmentId, key);
      }
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-[var(--color-panel-bg)] p-3">
      {/* Header — spans the same grid as sliders: label + slider + value + badge | reset col */}
      <div className="mb-2 flex items-center gap-3">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          Audio Settings
        </span>
        <span className="flex-1" />
        {audioDuration !== undefined && audioDuration > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {audioDuration.toFixed(1)}s
          </span>
        )}
        {overrideCount > 0 && (
          <span className="rounded-full bg-[var(--color-origin-analyzed)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-origin-analyzed)]">
            {overrideCount} optimized
          </span>
        )}
        {/* Reset all — aligned with the per-row reset column (w-5) */}
        {hasUserOverrides && !readOnly ? (
          <button
            onClick={resetAllToAnalyzed}
            className="w-5 shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Reset all to AI optimized"
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

      {/* Settings grouped by category */}
      {CATEGORIES.map(({ key, label }) => {
        const metas = SETTING_META.filter((m) => m.category === key);
        if (metas.length === 0) return null;

        return (
          <div key={key} className="mb-2 last:mb-0">
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]/60">
              {label}
            </div>
            {metas.map((meta) => {
              const tv = audio[meta.key as keyof SegmentAudioSettings];
              if (!tv) return null;
              return (
                <SettingSlider
                  key={meta.key}
                  label={meta.label}
                  description={meta.description}
                  tracked={tv}
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  unit={meta.unit}
                  readOnly={readOnly}
                  onChange={(val) => setOverride(segmentId, meta.key as keyof SegmentAudioSettings, val)}
                  onReset={() => clearOverride(segmentId, meta.key as keyof SegmentAudioSettings)}
                />
              );
            })}
          </div>
        );
      })}

      {/* Legend */}
      <div className="mt-2 flex items-center gap-3 border-t border-[var(--color-border)]/20 pt-2">
        {(["default", "analyzed", "user"] as const).map((origin) => (
          <span key={origin} className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(--color-origin-${origin})` }}
            />
            {origin === "default" ? "Default" : origin === "analyzed" ? "AI Optimized" : "Your Override"}
          </span>
        ))}
      </div>
    </div>
  );
}
