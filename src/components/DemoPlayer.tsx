import { useEffect, useRef, useState, useCallback } from "react";
import { getSpeakerColor } from "../utils/speaker-colors";
import type { DemoManifest } from "../types/demo";
import { demoAssetUrl } from "../types/demo";
import { computeGapMs, processSegment, DEFAULT_CONFIG } from "../engine/audio-processor";
import { useSegmentSettingsStore } from "../stores/segment-settings-store";
import { cachedFetch } from "../utils/audio-cache";
import { createAudioContext, safeDecode } from "../utils/audio-context";

interface Props {
  manifest: DemoManifest;
}

interface SegTiming {
  id: string;
  speaker: string;
  audioUrl: string;
  gapBeforeMs: number;
  index: number;
}

export default function DemoPlayer({ manifest }: Props) {
  const { story, audioSegments } = manifest;
  const allSpeakers = story.characters.map((c) => c.name);
  const segments = story.segments;

  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [segProgress, setSegProgress] = useState(0); // 0-1 within current segment
  const [totalElapsed, setTotalElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gapTimerRef = useRef<number>(0);
  const animRef = useRef<number>(0);
  const playingRef = useRef(false);
  const scrollRef = useRef<HTMLOListElement>(null);
  const lastTrailingSilence = useRef(0.3);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Shared AudioContext — reuse across segments to avoid per-segment creation pops
  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = createAudioContext();
    }
    return audioCtxRef.current;
  }

  // Build segment timings — reactive to settings store gap changes
  const settingsState = useSegmentSettingsStore((s) => s.settings);
  const timings: SegTiming[] = segments.map((seg, i) => {
    const audioSeg = audioSegments.find((a) => a.segmentId === seg.id);
    // Read gap from settings store if available, otherwise compute default
    const ss = settingsState[seg.id];
    const gapMs = ss?.audio.gapBeforeMs.value ?? computeGapMs({
      prevSpeaker: i > 0 ? segments[i - 1].speaker : null,
      currentSpeaker: seg.speaker,
      nextSpeaker: i < segments.length - 1 ? segments[i + 1].speaker : null,
      prevTrailingSilenceRatio: 0.3,
      isShortSegment: false,
      isFirstSegment: i === 0,
      isLastSegment: i === segments.length - 1,
    });
    return {
      id: seg.id,
      speaker: seg.speaker,
      audioUrl: audioSeg ? demoAssetUrl(audioSeg.file) : "",
      gapBeforeMs: gapMs,
      index: i,
    };
  });

  // Play a specific segment
  const playSegment = useCallback((idx: number) => {
    if (idx >= timings.length) {
      // Finished all segments
      playingRef.current = false;
      setPlaying(false);
      return;
    }

    const timing = timings[idx];
    setCurrentIdx(idx);
    setSegProgress(0);

    // Use gap from settings store (includes user overrides)
    const dynamicGapMs = timing.gapBeforeMs;

    // Scroll current segment into view
    setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-player-seg="${idx}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);

    // Wait for gap, then process and play audio
    gapTimerRef.current = window.setTimeout(async () => {
      if (!playingRef.current) return;

      try {
        // Fetch and decode the audio (reuse shared AudioContext)
        const audioCtx = getAudioCtx();
        if (audioCtx.state === "suspended") await audioCtx.resume();

        const res = await cachedFetch(timing.audioUrl);
        const arrayBuf = await res.arrayBuffer();
        const decoded = await safeDecode(audioCtx, arrayBuf);

        if (!playingRef.current) return;

        // Process with current user settings
        const ss = settingsState[timing.id]?.audio;
        const config = ss ? {
          ...DEFAULT_CONFIG,
          targetLufs: ss.targetLufs.value,
          peakLimitDb: ss.peakLimitDb.value,
          earlyStopMs: ss.earlyStopMs.value,
          fadeInMs: ss.fadeInMs.value,
          fadeOutMs: ss.fadeOutMs.value,
          fadeInStrength: ss.fadeInStrength.value,
          fadeOutStrength: ss.fadeOutStrength.value,
        } : DEFAULT_CONFIG;
        const processed = processSegment({
          id: timing.id,
          speaker: timing.speaker,
          voiceText: segments[idx]?.voiceText || "",
          audioBuffer: decoded,
        }, config);

        // Store trailing silence for next gap computation
        lastTrailingSilence.current = processed.trailingSilenceRatio;

        // Create a new AudioBuffer with the processed PCM
        const outBuffer = audioCtx.createBuffer(1, processed.pcm.length, processed.sampleRate);
        outBuffer.getChannelData(0).set(processed.pcm);

        // Play via shared AudioContext
        const source = audioCtx.createBufferSource();
        source.buffer = outBuffer;
        source.connect(audioCtx.destination);

        // Track for progress display
        const startTime = audioCtx.currentTime;
        const duration = outBuffer.duration;
        let stopped = false;

        audioRef.current = {
          pause: () => { if (!stopped) { stopped = true; try { source.stop(); } catch {} } },
          get currentTime() { return audioCtx.currentTime - startTime; },
          get duration() { return duration; },
          get paused() { return stopped; },
          get ended() { return audioCtx.currentTime - startTime >= duration; },
        } as unknown as HTMLAudioElement;

        source.onended = () => {
          stopped = true;
          if (playingRef.current) playSegment(idx + 1);
        };

        source.start();
      } catch {
        if (playingRef.current) playSegment(idx + 1);
      }
    }, dynamicGapMs);
  }, [timings]);

  // Track progress
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const startTime = performance.now();
    const startElapsed = totalElapsed;

    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused && audio.duration) {
        setSegProgress(audio.currentTime / audio.duration);
      }
      setTotalElapsed(startElapsed + (performance.now() - startTime) / 1000);
      if (playingRef.current) {
        animRef.current = requestAnimationFrame(tick);
      }
    };
    animRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animRef.current);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePlay() {
    if (playing) {
      // Pause — stop current source and clear ref
      playingRef.current = false;
      setPlaying(false);
      clearTimeout(gapTimerRef.current);
      try { audioRef.current?.pause(); } catch { /* ok */ }
      audioRef.current = null;
    } else {
      // Play / resume — always restart current segment (buffer sources can't resume)
      playingRef.current = true;
      setPlaying(true);
      playSegment(currentIdx);
    }
  }

  function handleSeekSegment(idx: number) {
    // Stop current playback
    clearTimeout(gapTimerRef.current);
    audioRef.current?.pause();
    audioRef.current = null;

    setCurrentIdx(idx);
    setSegProgress(0);

    if (playing) {
      playSegment(idx);
    }
  }

  function handleRestart() {
    clearTimeout(gapTimerRef.current);
    audioRef.current?.pause();
    audioRef.current = null;
    setCurrentIdx(0);
    setSegProgress(0);
    setTotalElapsed(0);
    if (playing) {
      playSegment(0);
    }
  }

  // Auto-play on mount
  useEffect(() => {
    playingRef.current = true;
    setPlaying(true);
    playSegment(0);
    return () => {
      playingRef.current = false;
      clearTimeout(gapTimerRef.current);
      audioRef.current?.pause();
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Overall progress
  const overallProgress = segments.length > 0
    ? (currentIdx + segProgress) / segments.length
    : 0;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Controls bar */}
      <div role="toolbar" aria-label="Playback controls" className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <button
          onClick={handlePlay}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <button
          onClick={handleRestart}
          className="cursor-pointer rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Restart"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>

        <div className="flex-1">
          {/* Progress bar — clickable to seek */}
          <div
            className="h-2 w-full cursor-pointer overflow-hidden rounded-full bg-[var(--color-border)]"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const targetIdx = Math.min(Math.floor(frac * segments.length), segments.length - 1);
              handleSeekSegment(targetIdx);
            }}
          >
            <div
              className="pointer-events-none h-full rounded-full bg-[var(--color-primary)] transition-all duration-200"
              style={{ width: `${overallProgress * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>Segment {currentIdx + 1} / {segments.length}</span>
            <span>{formatTime(totalElapsed)}</span>
          </div>
        </div>
      </div>

      {/* Segment list with current highlight */}
      <ol ref={scrollRef} aria-label="Segments" className="max-h-60 overflow-auto">
        {segments.map((seg, i) => {
          const color = getSpeakerColor(seg.speaker, allSpeakers);
          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;

          return (
            <li
              key={seg.id}
              data-player-seg={i}
              onClick={() => handleSeekSegment(i)}
              className={`flex cursor-pointer items-start gap-2 border-b border-[var(--color-border)]/30 px-4 py-1.5 transition-all ${
                isCurrent
                  ? "bg-[var(--color-primary)]/5"
                  : "hover:bg-[var(--color-surface)]"
              }`}
            >
              {/* Progress indicator */}
              <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                {isCurrent && playing ? (
                  <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
                ) : isPast ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-[var(--color-text-muted)]">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)]">{i + 1}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold" style={{ color: color.text }}>
                  {seg.speaker}
                </span>
                {timings[i]?.gapBeforeMs > 0 && i > 0 && (
                  <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">
                    +{timings[i].gapBeforeMs}ms gap
                  </span>
                )}
                <p className={`text-xs leading-relaxed ${isCurrent ? "text-[var(--color-text)]" : isPast ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-secondary)]"}`}>
                  {seg.voiceText.length > 80 ? seg.voiceText.slice(0, 77) + "..." : seg.voiceText}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
