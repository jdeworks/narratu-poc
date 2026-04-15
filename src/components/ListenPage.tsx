import { useEffect, useRef, useState } from "react";
import { createAudioContext, safeDecode } from "../utils/audio-context";
import { computePeaks } from "../utils/peak-utils";

// @ts-expect-error -- Vite injects BASE_URL at build time
const BASE: string = import.meta.env?.BASE_URL ?? "/";

interface Track {
  id: string;
  title: string;
  subtitle: string;
  details: string[];
  file: string;
  badge: string;
  badgeColor: string;
}

const TRACKS: Track[] = [
  {
    id: "voiceline",
    title: "Voiceline Export",
    subtitle: "7 AI characters, voices only",
    details: [
      "63 voiced segments with distinct character voices",
      "AI-optimized gap timing based on speaker transitions",
      "LUFS normalization for consistent loudness",
      "Fade curves and trailing artifact trimming",
      "No background music or sound effects",
    ],
    file: "demo/exports/poc-export-the-open-window-voiceline.mp3",
    badge: "Voices",
    badgeColor: "var(--color-origin-analyzed)",
  },
  {
    id: "full",
    title: "Full Audiobook",
    subtitle: "Voices + music + sound effects",
    details: [
      "Complete 4-track mix from the audio mixer",
      "AI-suggested background music with fade envelopes",
      "Sound effects placed at narrative moments",
      "Volume automation and loop regions applied",
      "All mixer settings baked into the export",
    ],
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
          "The Open Window" by Saki — generated entirely by AI
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-5 py-3 text-sm text-[var(--color-text-secondary)]">
        <strong className="text-[var(--color-warning)]">PoC Exports</strong>{" "}
        Exported from the demo using AI-optimized defaults. The production tool adds master bus processing, per-character EQ, and dynamic range optimization.
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
  const peaksRef = useRef<number[]>([]);
  const timeRef = useRef(0);
  const durationRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [timeDisplay, setTimeDisplay] = useState("0:00");
  const [durationDisplay, setDurationDisplay] = useState("--:--");
  const [showDetails, setShowDetails] = useState(false);

  const url = BASE + track.file;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  // Draw waveform — called from RAF, no React state dependency
  function drawWaveform() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dur = durationRef.current || (audioRef.current?.duration || 0);
    const progressFrac = dur > 0 ? timeRef.current / dur : 0;

    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue("--color-primary").trim();
    const mutedColor = styles.getPropertyValue("--color-text-muted").trim();
    const peaks = peaksRef.current;

    if (peaks.length > 0) {
      // Full waveform
      const mid = h / 2;
      const barW = w / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const x = i * barW;
        const barH = peaks[i] * mid * 0.9;
        const frac = i / peaks.length;
        ctx.fillStyle = frac < progressFrac ? primaryColor : mutedColor;
        ctx.globalAlpha = frac < progressFrac ? 0.8 : 0.2;
        ctx.fillRect(x, mid - barH, Math.max(barW - 0.5, 0.5), barH * 2);
      }
    } else {
      // Simple progress bar while peaks load
      const barH = h * 0.15;
      const y = (h - barH) / 2;
      ctx.fillStyle = mutedColor;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, y, w, barH);
      if (progressFrac > 0) {
        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(0, y, w * progressFrac, barH);
      }
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
  }

  // Animation loop
  function tick() {
    if (audioRef.current && !audioRef.current.paused) {
      timeRef.current = audioRef.current.currentTime;
      drawWaveform();
      const newDisplay = fmt(timeRef.current);
      setTimeDisplay((prev) => prev === newDisplay ? prev : newDisplay);
      animRef.current = requestAnimationFrame(tick);
    }
  }

  // Create audio element immediately (streams — no decode wait)
  useEffect(() => {
    const audio = new Audio(url);
    audio.preload = "metadata";
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      durationRef.current = audio.duration;
      setDurationDisplay(fmt(audio.duration));
    };
    audio.onended = () => {
      setPlaying(false);
      timeRef.current = 0;
      setTimeDisplay("0:00");
      drawWaveform();
    };

    return () => {
      cancelAnimationFrame(animRef.current);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load peaks in background (purely for visualization)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const ctx = createAudioContext();
        const decoded = await safeDecode(ctx, buf);
        if (cancelled) { await ctx.close(); return; }
        peaksRef.current = computePeaks(decoded.getChannelData(0), 800);
        durationRef.current = decoded.duration;
        setDurationDisplay(fmt(decoded.duration));
        drawWaveform();
        await ctx.close();
      } catch {
        /* peaks are optional — player still works without them */
      }
    })();
    return () => { cancelled = true; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => {
        setPlaying(true);
        animRef.current = requestAnimationFrame(tick);
      }).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seek(e: React.MouseEvent<HTMLCanvasElement>) {
    const audio = audioRef.current;
    const dur = durationRef.current || (audio?.duration || 0);
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = frac * dur;

    if (audio) audio.currentTime = newTime;
    timeRef.current = newTime;
    setTimeDisplay(fmt(newTime));
    drawWaveform();
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header — title, badge, subtitle */}
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
            className={`shrink-0 rounded-full p-2.5 transition-colors ${
              playing
                ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            }`}
          >
            {playing ? (
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
          <span>{timeDisplay}</span>
          <span>{durationDisplay}</span>
        </div>
      </div>

      {/* Collapsible details */}
      <div className="border-t border-[var(--color-border)]/30">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center gap-2 px-5 py-2.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${showDetails ? "rotate-90" : ""}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          What's in this export
        </button>
        {showDetails && (
          <ul className="px-5 pb-3 space-y-1">
            {track.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-muted)]/40" />
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
