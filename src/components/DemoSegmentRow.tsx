import { useEffect, useRef, useState } from "react";
import { playAudio, stopAudio, onPlayingChange, getPlayingId, getCurrentAudio, seekAudio } from "../utils/audio-player";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { extractTags } from "../utils/extract-tags";
import { useProcessedSegment } from "../utils/use-processed-segment";
import SegmentSettingsPanel from "./SegmentSettingsPanel";

interface Props {
  segment: {
    id: string;
    speaker: string;
    originalText: string;
    voiceText: string;
    inflection: string;
    emotion: string;
  };
  color: { text: string; bg: string; border: string };
  audioUrl?: string;
  isHighlighted?: boolean;
  onClickSpeaker: () => void;
}

export default function DemoSegmentRow({
  segment,
  color,
  audioUrl,
  isHighlighted,
  onClickSpeaker,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const tags = extractTags(segment.voiceText).filter((t) => t !== "pause" && t !== "long pause");
  const [playingId, setPlayingId] = useState<string | null>(getPlayingId());
  const isPlaying = playingId === segment.id;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playbackPos, setPlaybackPos] = useState(0);
  const animRef = useRef<number>(0);

  // Process segment through pipeline with current settings (only when expanded)
  const processed = useProcessedSegment(
    segment.id, segment.speaker, segment.voiceText, audioUrl, expanded,
  );

  useEffect(() => onPlayingChange(setPlayingId), []);

  useEffect(() => {
    if (!isPlaying) { setPlaybackPos(0); return; }
    const tick = () => {
      const audio = getCurrentAudio();
      if (audio && !audio.paused) {
        setPlaybackPos(audio.currentTime / (audio.duration || 1));
        animRef.current = requestAnimationFrame(tick);
      } else {
        setPlaybackPos(0);
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    // Play processed version if available, otherwise raw
    const url = processed?.playUrl ?? audioUrl;
    if (!url) return;
    if (isPlaying) {
      stopAudio();
    } else {
      playAudio(url, undefined, segment.id);
    }
  }

  // Render processed waveform with stable gap noise
  useEffect(() => {
    if (!canvasRef.current || !processed) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;
    const rgb = hexToRgb(color.border);

    // Read theme-aware canvas colors from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const waveUnplayed = styles.getPropertyValue("--color-wave-unplayed").trim();
    const waveNoise = styles.getPropertyValue("--color-wave-noise").trim();
    const waveNoiseBar = styles.getPropertyValue("--color-wave-noise-bar").trim();
    const waveCursor = styles.getPropertyValue("--color-wave-cursor").trim();
    const waveFade = styles.getPropertyValue("--color-wave-fade").trim();

    ctx.clearRect(0, 0, w, h);

    // Gap proportion matches actual audio content ratio
    const gapFrac = processed.gapFraction;
    const gapW = gapFrac * w;
    const waveW = w - gapW;

    // Draw gap noise section (stable — seeded, not random)
    if (gapW > 2) {
      ctx.fillStyle = waveNoise;
      ctx.fillRect(0, 0, gapW, h);
      const np = processed.noisePeaks;
      const noiseBarW = gapW / np.length;
      ctx.fillStyle = waveNoiseBar;
      for (let i = 0; i < np.length; i++) {
        const barH = np[i] * h;
        ctx.fillRect(i * noiseBarW, mid - barH, Math.max(noiseBarW - 0.5, 0.5), barH * 2);
      }
      ctx.strokeStyle = waveNoiseBar;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(gapW, 0);
      ctx.lineTo(gapW, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw processed waveform peaks
    const peaks = processed.peaks;
    const barW = waveW / peaks.length;
    const cursorX = isPlaying && playbackPos > 0 ? playbackPos * w : 0;

    for (let i = 0; i < peaks.length; i++) {
      const barH = peaks[i] * mid * 0.9;
      const x = gapW + i * barW;
      const played = isPlaying && x < cursorX;
      ctx.fillStyle = played ? `rgba(${rgb}, 0.9)` : waveUnplayed;
      ctx.fillRect(x, mid - barH, Math.max(barW - 0.5, 0.5), barH * 2);
    }

    // Fade overlays
    if (processed.fadeMs > 0 && processed.audioDuration > 0) {
      const fadeFrac = processed.fadeMs / (processed.audioDuration * 1000);
      const fadeInW = fadeFrac * waveW;
      const fadeOutW = fadeFrac * waveW;

      if (fadeInW > 1) {
        const grad = ctx.createLinearGradient(gapW, 0, gapW + fadeInW, 0);
        grad.addColorStop(0, waveFade);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(gapW, 0, fadeInW, h);
      }
      if (fadeOutW > 1) {
        const fadeOutX = gapW + waveW - fadeOutW;
        const grad = ctx.createLinearGradient(fadeOutX, 0, gapW + waveW, 0);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, waveFade);
        ctx.fillStyle = grad;
        ctx.fillRect(fadeOutX, 0, fadeOutW, h);
      }
    }

    // Playback cursor
    if (isPlaying && cursorX > 0) {
      ctx.strokeStyle = waveCursor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();
    }
  }, [processed, color.border, isPlaying, playbackPos]);

  return (
    <div
      data-seg-id={segment.id}
      className={`cursor-pointer rounded-lg border-l-[3px] px-4 py-2 transition-all hover:bg-[var(--color-surface)] ${
        isHighlighted ? "ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/5 animate-pulse" : ""
      }`}
      style={{ borderColor: color.border }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div className="mb-0.5 flex items-center gap-2">
        {audioUrl && (
          <button
            onClick={togglePlay}
            className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
              isPlaying
                ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
            title={isPlaying ? "Stop" : "Play"}
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onClickSpeaker(); }}
          className="cursor-pointer py-1 text-xs font-semibold leading-none hover:underline"
          style={{ color: color.text }}
        >
          {segment.speaker}
        </button>
        {tags.length > 0 && tags.map((tag) => (
          <span key={tag} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
            {tag}
          </span>
        ))}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`ml-auto shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      {/* Voice text (always visible) */}
      <p className="text-sm leading-relaxed text-[var(--color-text)]">
        {expanded ? segment.voiceText : truncate(segment.voiceText, 120)}
      </p>

      {/* Expanded view */}
      {expanded && (
        <ExpandedSegment
          segment={segment}
          audioUrl={audioUrl}
          processed={processed}
          canvasRef={canvasRef}
          isPlaying={isPlaying}
          playbackPos={playbackPos}
          color={color}
        />
      )}
    </div>
  );
}

function ExpandedSegment({ segment, audioUrl, processed, canvasRef, isPlaying, playbackPos, color }: {
  segment: { id: string; originalText: string; voiceText: string; inflection: string; emotion: string };
  audioUrl?: string;
  processed: import("../utils/use-processed-segment").ProcessedWaveform | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPlaying: boolean;
  playbackPos: number;
  color: { text: string; bg: string; border: string };
}) {
  const setContentOverride = useSegmentSettingsStore((s) => s.setContentOverride);
  const contentSettings = useSegmentSettingsStore((s) => s.settings[segment.id]?.content);
  const allTags = extractTags(segment.voiceText);

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--color-border)]/30 pt-3" onClick={(e) => e.stopPropagation()}>
      {/* Audio tags extracted from voiceText */}
      {allTags.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Audio tags</label>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
                [{tag}]
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Original text (read-only) */}
      <div>
        <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">Original text</label>
        <p className="rounded bg-[var(--color-bg)] p-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {segment.originalText}
        </p>
      </div>

      {/* Voice text — read-only in demo, shows the tagged text */}
      <div>
        <label className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">Voice text (with tags)</label>
        <div className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] p-2 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {contentSettings?.voiceText.value ?? segment.voiceText}
        </div>
      </div>

      {/* Processed waveform (gap noise + trimmed/normalized audio) */}
      {audioUrl && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Processed Waveform</label>
            {processed && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {processed.gapMs > 0 && `${Math.round(processed.gapMs)}ms gap + `}{processed.duration.toFixed(1)}s
              </span>
            )}
          </div>
          {processed ? (
            <canvas
              ref={canvasRef}
              width={600}
              height={60}
              className="w-full cursor-pointer rounded bg-[var(--color-bg)]"
              style={{ height: 60 }}
              onClick={(e) => {
                e.stopPropagation();
                if (!processed?.playUrl || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                // Position maps directly — blob contains gap + audio
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                if (isPlaying) {
                  seekAudio(pos);
                } else {
                  playAudio(processed.playUrl, undefined, segment.id);
                  setTimeout(() => seekAudio(pos), 50);
                }
              }}
            />
          ) : (
            <div className="flex h-[60px] items-center justify-center rounded bg-[var(--color-bg)] text-xs text-[var(--color-text-muted)]">
              <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
              Processing...
            </div>
          )}
        </div>
      )}

      {/* Audio settings panel */}
      <SegmentSettingsPanel segmentId={segment.id} audioDuration={processed?.audioDuration} />
    </div>
  );
}

function hexToRgb(color: string): string {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : "100, 100, 100";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}
