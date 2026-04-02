import { useState } from "react";
import type { SegmentSettings, SegmentAudioSettings, TrackedValue } from "../types/segment-settings";
import { SETTING_META } from "../engine/audio-processor";
import { getSpeakerColor } from "../utils/speaker-colors";
import { extractTags } from "../utils/extract-tags";

interface Props {
  settings: SegmentSettings;
  segIndex: number;
  allSpeakers: string[];
}

export default function SegmentDiff({ settings, segIndex, allSpeakers }: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = getSpeakerColor(settings.speaker, allSpeakers);

  // Count non-default values
  const audioOverrides = Object.values(settings.audio).filter((tv) => tv.origin !== "default").length;
  const contentOverrides = Object.values(settings.content).filter((tv) => tv.origin !== "default").length;
  const totalOverrides = audioOverrides + contentOverrides;

  return (
    <div className={`rounded-lg border border-[var(--color-border)]/30 ${totalOverrides > 0 ? "border-l-2" : ""}`}
      style={totalOverrides > 0 ? { borderLeftColor: color.border } : undefined}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-xs text-[var(--color-text-muted)]">#{segIndex + 1}</span>
        <span className="text-sm font-medium" style={{ color: color.text }}>{settings.speaker}</span>
        {extractTags(settings.content.voiceText.value as string).filter((t) => t !== "pause" && t !== "long pause").map((tag) => (
          <span key={tag} className="rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)]">[{tag}]</span>
        ))}
        {totalOverrides > 0 && (
          <span className="ml-auto flex items-center gap-1">
            {audioOverrides > 0 && (
              <span className="rounded-full bg-[var(--color-origin-analyzed)]/10 px-2 py-0.5 text-[10px] text-[var(--color-origin-analyzed)]">
                {audioOverrides} audio
              </span>
            )}
            {contentOverrides > 0 && (
              <span className="rounded-full bg-[var(--color-origin-user)]/10 px-2 py-0.5 text-[10px] text-[var(--color-origin-user)]">
                {contentOverrides} content
              </span>
            )}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)]/20 px-3 py-2 space-y-2">
          {/* Audio settings */}
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]/60">Audio</div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-sm">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Setting</span>
              <span className="text-right text-xs font-medium text-[var(--color-text-muted)]">Default</span>
              <span className="text-right text-xs font-medium text-[var(--color-text-muted)]">AI</span>
              <span className="w-10 text-center text-xs font-medium text-[var(--color-text-muted)]">User</span>
              {SETTING_META.map((meta) => {
                const tv = settings.audio[meta.key as keyof SegmentAudioSettings];
                if (!tv) return null;
                return <SettingRow key={meta.key} label={meta.label} tv={tv} unit={meta.unit} />;
              })}
            </div>
          </div>

          {/* Voice text + tags */}
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]/60">Voice Text</div>
            <p className="rounded bg-[var(--color-bg)] p-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {settings.content.voiceText.value}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow<T extends string | number>({ label, tv, unit }: { label: string; tv: TrackedValue<T>; unit?: string }) {
  const u = unit ?? "";
  const hasAnalyzed = tv.analyzedValue !== undefined && tv.analyzedValue !== tv.defaultValue;
  const hasUser = tv.origin === "user";
  return (
    <>
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-right text-[var(--color-text-secondary)]">{String(tv.defaultValue)}{u}</span>
      <span className="text-right">
        {hasAnalyzed ? (
          <span className="text-[var(--color-origin-analyzed)]">{String(tv.analyzedValue)}{u}</span>
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </span>
      <span className="w-10 text-right">
        {hasUser ? (
          <span className="font-medium text-[var(--color-origin-user)]">{String(tv.value)}{u}</span>
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </span>
    </>
  );
}
