import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../stores/project-store";
import { getSpeakerColor } from "../utils/speaker-colors";
import type { GeneratedSegment } from "../engine/audio-generator";

interface Props {
  generated: GeneratedSegment[];
  fullAudio: Blob;
}

export default function PlaybackView({ generated, fullAudio }: Props) {
  const segments = useProjectStore((s) => s.segments);
  const characters = useProjectStore((s) => s.characters);
  const setView = useProjectStore((s) => s.setView);
  const allSpeakers = characters.map((c) => c.name);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegIdx, setCurrentSegIdx] = useState(-1);
  const [audioUrl, setAudioUrl] = useState<string>("");

  // Build cumulative time ranges for segment highlighting
  const segRanges = useRef<{ start: number; end: number }[]>([]);
  useEffect(() => {
    let t = 0;
    segRanges.current = generated.map((g) => {
      const start = t;
      t += g.duration;
      return { start, end: t };
    });
  }, [generated]);

  useEffect(() => {
    const url = URL.createObjectURL(fullAudio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [fullAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      // Find current segment
      const idx = segRanges.current.findIndex(
        (r) => audio.currentTime >= r.start && audio.currentTime < r.end,
      );
      setCurrentSegIdx(idx);
    };
    const onMeta = () => setDuration(audio.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setCurrentSegIdx(-1);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
    };
  }, [audioUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  }

  function download() {
    const ext = fullAudio.type.includes("webm") ? "webm" : "ogg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(fullAudio);
    a.download = `narratu-audiobook.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalDuration = generated.reduce((s, g) => s + g.duration, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audiobook Player</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {generated.length} segments &middot; {formatTime(totalDuration)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("editor")}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
          >
            Back to Editor
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
          >
            Download
          </button>
        </div>
      </div>

      {/* Audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      {/* Player controls */}
      <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
          >
            {playing ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={seek}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="mt-1 flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Segment list with highlighting */}
      <div className="space-y-1">
        {segments.map((seg, i) => {
          const color = getSpeakerColor(seg.speaker, allSpeakers);
          const isCurrent = i === currentSegIdx;
          const genSeg = generated[i];

          return (
            <div
              key={seg.id}
              className={`rounded-lg border-l-[3px] px-4 py-2 transition-all ${
                isCurrent ? "scale-[1.01]" : "opacity-70"
              }`}
              style={{
                borderColor: color.border,
                backgroundColor: isCurrent ? color.bg : "transparent",
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-xs font-semibold"
                  style={{ color: color.text }}
                >
                  {seg.speaker}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {genSeg ? formatTime(genSeg.duration) : ""}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text)] leading-relaxed">
                {seg.voiceText}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
