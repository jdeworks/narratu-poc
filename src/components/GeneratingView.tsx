import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../stores/project-store";
import { useSettingsStore } from "../stores/settings-store";
import { getSpeakerColor } from "../utils/speaker-colors";
import {
  generateAllSegments as generateChrome,
  concatenateAudio,
  type GeneratedSegment,
  type GenerationProgress,
} from "../engine/audio-generator";
import {
  ensureVoicesLoaded,
  generateVoiceOptions,
  type VoiceOption,
} from "../engine/tts-chrome";
import {
  generateAllSegments as generateElevenLabs,
  concatenateAudioMp3 as concatElevenLabs,
  fetchVoices as fetchElevenLabsVoices,
  matchVoiceOptions as matchElevenLabsVoices,
} from "../engine/tts-elevenlabs";
import {
  generateAllSegments as generateHume,
  concatenateAudioMp3 as concatHume,
  fetchVoices as fetchHumeVoices,
  matchVoiceOptions as matchHumeVoices,
} from "../engine/tts-hume";

interface Props {
  onComplete: (generated: GeneratedSegment[], fullAudio: Blob) => void;
}

export default function GeneratingView({ onComplete }: Props) {
  const segments = useProjectStore((s) => s.segments);
  const characters = useProjectStore((s) => s.characters);
  const voiceSelections = useProjectStore((s) => s.voiceSelections);
  const setView = useProjectStore((s) => s.setView);
  const ttsProvider = useSettingsStore((s) => s.ttsProvider);
  const ttsApiKey = useSettingsStore((s) => s.ttsApiKey);
  const allSpeakers = characters.map((c) => c.name);

  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (running.current) return;
    running.current = true;

    async function run() {
      try {
        if (ttsProvider === "browser") {
          await runChromeTts();
        } else if (ttsProvider === "elevenlabs") {
          await runElevenLabs();
        } else if (ttsProvider === "hume") {
          await runHume();
        } else {
          setError(`${ttsProvider} voice generation not yet implemented.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    }

    async function runChromeTts() {
      const voices = await ensureVoicesLoaded();
      const voiceMap = new Map<string, VoiceOption>();
      for (const char of characters) {
        const options = generateVoiceOptions(
          char.name,
          char.voiceTraits,
          voices,
        );
        const selectedId = voiceSelections[char.name];
        const selected = options.find((o) => o.id === selectedId) || options[0];
        if (selected) voiceMap.set(char.name, selected);
      }
      const generated = await generateChrome(segments, voiceMap, setProgress);
      const fullAudio = await concatenateAudio(generated);
      onComplete(generated, fullAudio);
    }

    async function runElevenLabs() {
      if (!ttsApiKey) {
        setError("ElevenLabs API key required. Set it in the editor settings.");
        return;
      }
      const voices = await fetchElevenLabsVoices(ttsApiKey);
      const voiceMap = new Map<string, string>();
      for (const char of characters) {
        const options = matchElevenLabsVoices(char, voices);
        const selectedId = voiceSelections[char.name];
        const selected = options.find((o) => o.id === selectedId) || options[0];
        if (selected) voiceMap.set(char.name, selected.voiceId);
      }
      const generated = await generateElevenLabs(
        segments,
        voiceMap,
        ttsApiKey,
        setProgress,
      );
      const fullAudio = concatElevenLabs(generated);
      onComplete(generated, fullAudio);
    }

    async function runHume() {
      if (!ttsApiKey) {
        setError("Hume AI API key required. Set it in the editor settings.");
        return;
      }
      const voices = await fetchHumeVoices(ttsApiKey);
      const voiceMap = new Map<string, string>();
      for (const char of characters) {
        const options = matchHumeVoices(char, voices);
        const selectedId = voiceSelections[char.name];
        const selected = options.find((o) => o.id === selectedId) || options[0];
        if (selected) voiceMap.set(char.name, selected.voiceName);
      }
      const generated = await generateHume(
        segments,
        voiceMap,
        ttsApiKey,
        setProgress,
      );
      const fullAudio = concatHume(generated);
      onComplete(generated, fullAudio);
    }

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 text-4xl">&#9888;</div>
        <h2 className="mb-2 text-xl font-semibold">Generation failed</h2>
        <p className="mb-6 text-[var(--color-text-secondary)]">{error}</p>
        <button
          onClick={() => setView("editor")}
          className="cursor-pointer rounded-lg bg-[var(--color-primary)] px-6 py-2 font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
        >
          Back to Editor
        </button>
      </div>
    );
  }

  const providerLabels: Record<string, string> = {
    browser: "Chrome TTS",
    elevenlabs: "ElevenLabs",
    hume: "Hume AI",
  };
  const providerLabel = providerLabels[ttsProvider] ?? ttsProvider;
  const pct = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]" />

      <h2 className="mb-1 text-xl font-semibold">Generating Audio</h2>
      <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
        Generating each segment with {providerLabel}...
      </p>

      {progress && (
        <>
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-[var(--color-text-muted)]">
              {progress.current} / {progress.total}
            </span>
            <span
              className="font-medium"
              style={{
                color: getSpeakerColor(progress.speaker, allSpeakers).text,
              }}
            >
              {progress.speaker}
            </span>
          </div>

          {ttsProvider === "browser" && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Keep this tab active. Chrome TTS requires the tab to be focused.
            </p>
          )}
        </>
      )}
    </div>
  );
}
