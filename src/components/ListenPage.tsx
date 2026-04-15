import { useEffect, useRef, useState, useCallback } from "react";
import { createAudioContext, safeDecode } from "../utils/audio-context";
import { computePeaks } from "../utils/peak-utils";

// @ts-expect-error -- Vite injects BASE_URL at build time
const BASE: string = import.meta.env?.BASE_URL ?? "/";

interface Track {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  file: string;
  badge: string;
  badgeColor: string;
}

const TRACKS: Track[] = [
  {
    id: "voiceline",
    title: "Voiceline Export",
    subtitle: "Voices only — 7 AI characters, no music or SFX",
    description:
      "All 63 voiced segments with AI-optimized gap timing, LUFS normalization, fade curves, and trailing artifact trimming. This is the raw voiceline output — what the AI produces before any background audio is layered in.",
    file: "demo/exports/poc-export-the-open-window-voiceline.mp3",
    badge: "Voices",
    badgeColor: "var(--color-origin-analyzed)",
  },
  {
    id: "full",
    title: "Full Audiobook Export",
    subtitle: "Complete mix — voices, music, sound effects",
    description:
      "The full 4-track mix from the audio mixer: voiced segments plus AI-suggested background music and sound effects, with volume automation, loop regions, and fade envelopes applied.",
    file: "demo/exports/poc-export-the-open-window-full.mp3",
    badge: "Full Mix",
    badgeColor: "var(--color-primary)",
  },
];

export default function ListenPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Listen</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Exported audiobooks from the demo — "The Open Window" by Saki
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-5 py-3 text-sm text-[var(--color-text-secondary)]">
        <strong className="text-[var(--color-warning)]">PoC Exports</strong>{" "}
        These are exported directly from the demo page using AI-optimized defaults. The production tool adds master bus processing, per-character EQ, and dynamic range optimization.
      </div>

      <div className="space-y-6">
        {TRACKS.map((track) => (
          <TrackPlayer key={track.id} track={track} />
        ))}
      </div>

      {/* Coming soon */}
      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Coming Soon</h2>
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">Fully Optimized Version</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Master bus EQ and compression, per-character voice profiles, intelligent cross-fading, and dynamic range optimization for different listening environments.
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">Audio Play Format</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Direct speech without narrator attribution — like a radio drama. Characters speak directly with sound effects filling the gaps.
          </p>
        </div>
      </div>
    </div>
  );
}

function TrackPlayer({ track }: { track: Track }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = BASE + track.file;

  // Load peaks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const ctx = createAudioContext();
        const decoded = await safeDecode(ctx, buf);
        if (cancelled) { await ctx.close(); return; }
        const p = computePeaks(decoded.getChannelData(0), 800);
        setPeaks(p);
        setDuration(decoded.duration);
        await ctx.close();
      } catch {
        /* ignore load errors */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Animation loop for playback progress
  const tick = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      setCurrentTime(audioRef.current.currentTime);
      animRef.current = requestAnimationFrame(tick);
    }
  }, []);

  function togglePlay() {
    if (!audioRef.current) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); setCurrentTime(0); };
      audio.onpause = () => setPlaying(false);
      audio.onplay = () => { setPlaying(true); animRef.current = requestAnimationFrame(tick); };
    }
    if (audioRef.current.paused) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = frac * duration;
    setCurrentTime(frac * duration);
  }

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const barW = w / peaks.length;
    const progressFrac = duration > 0 ? currentTime / duration : 0;

    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue("--color-primary").trim();
    const mutedColor = styles.getPropertyValue("--color-text-muted").trim();

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const barH = peaks[i] * mid * 0.9;
      const frac = i / peaks.length;
      ctx.fillStyle = frac < progressFrac ? primaryColor : mutedColor;
      ctx.globalAlpha = frac < progressFrac ? 0.8 : 0.2;
      ctx.fillRect(x, mid - barH, Math.max(barW - 0.5, 0.5), barH * 2);
    }
    ctx.globalAlpha = 1;

    // Playhead
    if (progressFrac > 0) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressFrac * w, 0);
      ctx.lineTo(progressFrac * w, h);
      ctx.stroke();
    }
  }, [peaks, currentTime, duration]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
    };
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[var(--color-text)]">{track.title}</h3>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `color-mix(in srgb, ${track.badgeColor} 15%, transparent)`, color: track.badgeColor }}
          >
            {track.badge}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{track.subtitle}</p>
      </div>

      {/* Waveform + controls */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            disabled={loading}
            className={`shrink-0 rounded-full p-2.5 transition-colors ${
              playing
                ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            } disabled:opacity-40`}
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
          <div className="flex-1">
            <canvas
              ref={canvasRef}
              className="h-16 w-full cursor-pointer rounded"
              onClick={seek}
            />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)]">
          <span>{fmt(currentTime)}</span>
          <span>{duration > 0 ? fmt(duration) : "--:--"}</span>
        </div>
      </div>

      {/* Description */}
      <div className="border-t border-[var(--color-border)]/30 px-5 py-3">
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{track.description}</p>
      </div>
    </div>
  );
}
