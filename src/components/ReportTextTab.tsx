import { useCallback, useEffect, useRef, useState } from "react";
import type { SegmentSettings } from "../types/segment-settings";
import { getSpeakerColor } from "../utils/speaker-colors";

const CHUNK = 15;

interface Props {
  storyText: string;
  textSegments: { id: string; speaker: string; originalText: string; voiceText: string }[];
  allSettings: SegmentSettings[];
  allSpeakers: string[];
}

export default function ReportTextTab({ storyText, textSegments, allSettings, allSpeakers }: Props) {
  const [visibleCount, setVisibleCount] = useState(CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    setVisibleCount((v) => Math.min(v + CHUNK, textSegments.length));
  }, [textSegments.length]);

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
    <div className="space-y-5">
      {/* Original story */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Original Input
        </h3>
        <div className="max-h-48 overflow-auto rounded-lg bg-[var(--color-panel-bg)] p-4 font-serif text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {storyText}
        </div>
      </div>

      {/* Per-segment text comparison */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Per-Segment: Original vs Voice-Optimized
        </h3>
        <div className="space-y-1.5">
          {textSegments.slice(0, visibleCount).map((seg) => {
            const ss = allSettings.find((s) => s.segmentId === seg.id);
            const userText = ss && ss.content.voiceText.origin !== "default" ? ss.content.voiceText.value : undefined;
            const color = getSpeakerColor(seg.speaker, allSpeakers);
            return (
              <TextRow
                key={seg.id}
                speaker={seg.speaker}
                original={seg.originalText}
                voice={seg.voiceText}
                userEdit={userText}
                color={color}
              />
            );
          })}
          {visibleCount < textSegments.length && (
            <div ref={sentinelRef} className="py-3 text-center text-xs text-[var(--color-text-muted)]">
              {visibleCount} of {textSegments.length} segments...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TextRow({ speaker, original, voice, userEdit, color }: {
  speaker: string; original: string; voice: string; userEdit?: string;
  color: { text: string; bg: string; border: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const isDiff = original !== voice;

  return (
    <div className="rounded border-l-2 px-3 py-2" style={{ borderColor: color.border }}>
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-2 text-left">
        <span className="text-xs font-medium" style={{ color: color.text }}>{speaker}</span>
        <span className="flex-1 truncate text-sm text-[var(--color-text-secondary)]">{original}</span>
        {isDiff && <span className="shrink-0 text-[10px] text-[var(--color-origin-analyzed)]">optimized</span>}
        {userEdit && <span className="shrink-0 text-[10px] text-[var(--color-origin-user)]">edited</span>}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 text-sm">
          <div><span className="text-[var(--color-text-muted)]">Original:</span> <span className="text-[var(--color-text-secondary)]">{original}</span></div>
          {isDiff && (
            <div><span className="text-[var(--color-origin-analyzed)]">AI Voice:</span> <span className="font-mono text-[var(--color-text-secondary)]">{voice}</span></div>
          )}
          {userEdit && (
            <div><span className="text-[var(--color-origin-user)]">Your Edit:</span> <span className="font-mono text-[var(--color-text-secondary)]">{userEdit}</span></div>
          )}
        </div>
      )}
    </div>
  );
}
