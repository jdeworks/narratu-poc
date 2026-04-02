import { useState, useEffect } from "react";
import {
  playAudio,
  stopAudio,
  setDeEsser as setAudioDeEsser,
  setBrightness as setAudioBrightness,
  onPlayingChange,
  getPlayingId,
} from "../utils/audio-player";
import { type PresetVoice } from "../types/voices";
import {
  useVoiceAssignmentStore,
} from "../stores/voice-assignment-store";
import { useVoiceSamplesStore } from "../stores/voice-samples-store";
import { useProjectStore, type CharacterProfile, type StoredVoiceMatch } from "../stores/project-store";
import VoiceConflictDialog from "./VoiceConflictDialog";
import PresetVoiceBrowser from "./PresetVoiceBrowser";
import CreateVoiceModal from "./CreateVoiceModal";

interface Props {
  character: CharacterProfile;
}

/**
 * Build a sample text for voice preview from actual character dialogue.
 * Uses the same best-line scoring as the sidebar's SampleSentence, then
 * pads to >= 100 chars (ElevenLabs minimum).
 */
function getSampleTextForCharacter(character: CharacterProfile): string {
  const segments = useProjectStore.getState().segments;
  const charSegments = segments.filter((s) => s.speaker === character.name);
  if (charSegments.length === 0) {
    return "The evening was drawing in, and the room had grown quiet. She paused for a moment, gathering her thoughts before speaking again with careful deliberation. [pause]";
  }

  // Score lines same as sidebar: prefer 40-100 char, non-attribution, proper start
  const scored = charSegments
    .map((s) => {
      const text = s.voiceText || s.originalText;
      const len = text.length;
      let score = 0;
      if (len >= 40 && len <= 100) score += 50;
      else if (len >= 30 && len <= 150) score += 30;
      else if (len < 20) score -= 30;
      else if (len > 200) score -= 20;
      if (/^(said|asked|replied|cried|whispered|admitted|announced|pursued|his |her |he |she )\b/i.test(text)) score -= 60;
      if (/^[a-z]/.test(text)) score -= 20;
      const words = text.split(/\s+/).length;
      if (words >= 8 && words <= 20) score += 10;
      return { text, score };
    })
    .sort((a, b) => b.score - a.score);

  // Take top lines and concatenate until >= 100 chars
  let result = "";
  for (const { text } of scored) {
    result += (result ? " [pause] " : "") + text;
    if (result.length >= 100) break;
  }

  return result.slice(0, 250).trim() + " [pause]";
}

export default function VoiceOptions({ character }: Props) {
  const isDemo = useProjectStore((s) => s.view) === "demo";
  const { assignments, assign, unassign, getAssignedCharacter } =
    useVoiceAssignmentStore();
  const voiceSamples = useVoiceSamplesStore((s) => s.samples);
  const setSamples = useVoiceSamplesStore((s) => s.setSamples);
  const setVoiceNames = useVoiceSamplesStore((s) => s.setVoiceNames);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [conflict, setConflict] = useState<{
    voice: PresetVoice;
    assignedTo: string;
  } | null>(null);

  const currentAssignment = assignments[character.name];
  const demoVoiceNames = useVoiceSamplesStore((s) => s.voiceNames);
  const voiceProfileHint = useProjectStore((s) => s.enrichment?.voiceProfiles?.[character.name]);

  // Demo mode: Vera has pre-built custom voice samples (all v3, same sample text)
  // @ts-expect-error -- Vite injects BASE_URL
  const base: string = import.meta.env?.BASE_URL ?? "/";
  const demoSampleUrl = (file: string) => new URL(`${base}demo/${file}`, location.origin).href;
  const DEMO_CUSTOM_VOICES: Record<string, { previews: { generated_voice_id: string; permanent_voice_id: string; audio_url: string; sample_file: string }[]; selectedIndex: number; voiceName: string; voiceDescription: string; sampleText: string }> = {
    Vera: {
      previews: [
        { generated_voice_id: "4GGSUEeK5HWHAO6BsRq7", permanent_voice_id: "4GGSUEeK5HWHAO6BsRq7", audio_url: demoSampleUrl("samples/el-vera-custom-1.mp3"), sample_file: "samples/el-vera-custom-1.mp3" },
        { generated_voice_id: "M230eb66HNtM8ytYkhRn", permanent_voice_id: "M230eb66HNtM8ytYkhRn", audio_url: demoSampleUrl("samples/el-vera-custom-2.mp3"), sample_file: "samples/el-vera-custom-2.mp3" },
        { generated_voice_id: "cjt1ujRqD00TE0uUu9Gl", permanent_voice_id: "cjt1ujRqD00TE0uUu9Gl", audio_url: demoSampleUrl("samples/el-vera-custom-selected.mp3"), sample_file: "samples/el-vera-custom-selected.mp3" },
      ],
      selectedIndex: 2,
      voiceName: "Vera (custom)",
      voiceDescription: "A young British woman with a clear, composed voice. Precise diction, self-assured delivery, subtle mischievous undertone.",
      sampleText: "My aunt will be down presently, Mister Nuttel. [pause] In the meantime you must try and put up with me.",
    },
  };
  const customDemo = DEMO_CUSTOM_VOICES[character.name];
  const hasCustomVoiceDemo = !!customDemo;

  // Read stored voice matches (computed once during analysis)
  const allStoredMatches = useProjectStore((s) => s.voiceMatches[character.name]) ?? [];
  const storedMatches = allStoredMatches.slice(0, 3); // Top 3 for sidebar

  // Check if the selected voice is already in the top 3 matches
  const selectedInMatches = currentAssignment && storedMatches.some((m) => m.voice_id === currentAssignment.voiceId);

  // Get v3 sample URL for the selected voice (from voiceProfiles in manifest)
  // Fallback to demo custom voice URL if store hasn't synced yet
  const selectedSampleUrl = currentAssignment
    ? voiceSamples[currentAssignment.voiceId]?.mp3
      ?? customDemo?.previews.find((p) => p.permanent_voice_id === currentAssignment.voiceId)?.audio_url
    : undefined;

  function handleSelect(voice: PresetVoice) {
    const assignedTo = getAssignedCharacter(voice.id);
    if (assignedTo && assignedTo !== character.name) {
      setConflict({ voice, assignedTo });
      return;
    }
    doAssign(voice);
  }

  function doAssign(voice: PresetVoice) {
    assign(character.name, {
      voiceId: voice.id,
      voiceName: voice.name,
      source: "preset",
    });
    setShowBrowser(false);
    setConflict(null);
  }

  function handleConflictUseAnyway() {
    if (conflict) doAssign(conflict.voice);
  }

  function handleConflictUnassignAndUse() {
    if (conflict) {
      unassign(conflict.assignedTo);
      doAssign(conflict.voice);
    }
  }

  function handleCustomVoiceSelect(voiceId: string, voiceName: string, audioUrl: string) {
    // Register the custom voice sample for playback
    const allSamples = useVoiceSamplesStore.getState().samples;
    const allNames = useVoiceSamplesStore.getState().voiceNames;
    setSamples({ ...allSamples, [voiceId]: { mp3: audioUrl } });
    setVoiceNames({
      ...allNames,
      [voiceId]: { voiceName, characterName: character.name, provider: "elevenlabs" },
    });

    // Assign the voice
    assign(character.name, {
      voiceId,
      voiceName,
      source: "custom",
    });
    setShowCreate(false);
  }


  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]">
        Voice options (ElevenLabs)
      </label>

      <div className="space-y-1.5">
        {/* Selected voice if NOT in top 3 (e.g. Vera's custom, Theo Silk, Victoria) */}
        {currentAssignment && !selectedInMatches && (
          <StoredVoiceRow
            match={{
              voice_id: currentAssignment.voiceId,
              name: currentAssignment.voiceName,
              gender: "", age: "", accent: "", descriptive: "",
              description: "", preview_url: "",
              category: currentAssignment.source === "custom" ? "custom" : "",
              score: 0, reasons: [],
            }}
            sampleUrl={selectedSampleUrl}
            isSelected={true}
            isUsedByOther={false}
            usedBy={null}
            onSelect={() => {}}
            onDeselect={() => !isDemo && unassign(character.name)}
            locked={isDemo}
            badge="selected"
          />
        )}

        {/* Top 3 matched voices */}
        {storedMatches.map((m) => {
          const isSelected = currentAssignment?.voiceId === m.voice_id;
          const assignedTo = getAssignedCharacter(m.voice_id);
          const isUsedByOther = assignedTo !== null && assignedTo !== character.name;
          const sampleForMatch = voiceSamples[m.voice_id]?.mp3 || m.preview_url;
          return (
            <StoredVoiceRow
              key={m.voice_id}
              match={m}
              sampleUrl={sampleForMatch}
              isSelected={isSelected}
              isUsedByOther={isUsedByOther}
              usedBy={assignedTo}
              onSelect={() => !isDemo && handleSelect({
                id: m.voice_id,
                name: m.name,
                provider: "elevenlabs",
                gender: m.gender,
                age: m.age,
                accent: m.accent,
              })}
              onDeselect={() => !isDemo && unassign(character.name)}
              locked={isDemo}
              badge={isSelected ? "selected" : undefined}
            />
          );
        })}
      </div>

      {/* Voice tuning (collapsible) */}
      <VoiceTuning />

      {/* Action buttons */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setShowBrowser(true)}
          className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
        >
          Select from presets
        </button>
        {hasCustomVoiceDemo ? (
          <button
            onClick={() => setShowCreate(true)}
            className="cursor-pointer rounded-lg border border-dashed border-[var(--color-primary)]/40 px-3 py-1.5 text-xs text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
          >
            Create your own
          </button>
        ) : (
          <button
            className="cursor-not-allowed rounded-lg border border-dashed border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]"
            title="Create a custom voice from character traits. Available in production."
          >
            Create your own
          </button>
        )}
      </div>

      {/* Current selection */}
      {currentAssignment && (
        <div className="mt-2 flex items-center gap-1 text-xs text-[var(--color-primary)]">
          <span>
            Selected: {currentAssignment.voiceName}
            {currentAssignment.source === "custom" ? " (custom)" : ""}
          </span>
          {!isDemo && (
            <button
              onClick={() => unassign(character.name)}
              className="cursor-pointer rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
              title="Deselect voice"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      {showBrowser && (
        <PresetVoiceBrowser
          characterName={character.name}
          onSelect={handleSelect}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {conflict && (
        <VoiceConflictDialog
          voiceName={conflict.voice.name}
          assignedTo={conflict.assignedTo}
          onUseAnyway={handleConflictUseAnyway}
          onUnassignAndUse={handleConflictUnassignAndUse}
          onCancel={() => setConflict(null)}
        />
      )}

      {showCreate && (
        <CreateVoiceModal
          character={character}
          sampleText={getSampleTextForCharacter(character)}
          voiceProfileHint={voiceProfileHint}
          demoMode={customDemo}
          onSelect={handleCustomVoiceSelect}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function StoredVoiceRow({
  match: m,
  sampleUrl,
  isSelected,
  isUsedByOther,
  usedBy,
  onSelect,
  onDeselect,
  locked,
  badge,
}: {
  match: StoredVoiceMatch;
  sampleUrl?: string;
  isSelected: boolean;
  isUsedByOther: boolean;
  usedBy: string | null;
  onSelect: () => void;
  onDeselect: () => void;
  locked?: boolean;
  badge?: "selected";
}) {
  const [playingId, setPlayingId] = useState<string | null>(getPlayingId());
  const audioUrl = sampleUrl || m.preview_url;
  const playing = playingId === m.voice_id;

  useEffect(() => {
    return onPlayingChange(setPlayingId);
  }, []);

  function togglePlay() {
    if (playing) {
      stopAudio();
      return;
    }
    if (audioUrl) {
      playAudio(audioUrl, undefined, m.voice_id);
    }
  }

  return (
    <div
      className={`group relative rounded-lg border p-2 transition-colors ${
        isSelected
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
          : isUsedByOther
            ? "border-[var(--color-border)] opacity-50"
            : "border-[var(--color-border)]"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Play preview */}
        <button
          onClick={togglePlay}
          className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
            playing
              ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
              : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
          title={playing ? "Stop" : "Play preview"}
        >
          {playing ? (
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

        {/* Name + info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs text-[var(--color-text-secondary)]">
              {m.name}
            </span>
            {badge === "selected" && (
              <span className="shrink-0 rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs text-[var(--color-primary)]">
                selected
              </span>
            )}
          </div>
          {isUsedByOther && (
            <span className="ml-1 text-xs text-[var(--color-text-muted)]">
              (used by {usedBy})
            </span>
          )}
        </div>

        {/* Select / Deselect */}
        {locked ? (
          isSelected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--color-primary)]">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )
        ) : isSelected ? (
          <button
            onClick={onDeselect}
            className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
            title="Deselect"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <button
            onClick={onSelect}
            className="shrink-0 cursor-pointer rounded px-2 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
          >
            Select
          </button>
        )}
      </div>
    </div>
  );
}


function VoiceTuning() {
  const [open, setOpen] = useState(false);
  const [deEsser, setDeEsser] = useState(0);
  const [brightness, setBrightness] = useState(0);

  function handleDeEsser(v: number) {
    setDeEsser(v);
    setAudioDeEsser(v);
  }

  function handleBrightness(v: number) {
    setBrightness(v);
    setAudioBrightness(v);
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Voice tuning
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          {/* De-esser */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-[var(--color-text-muted)]">De-esser</label>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {deEsser === 0 ? "Off" : `${deEsser}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={deEsser}
              onChange={(e) => handleDeEsser(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Reduces harsh sibilant sounds (s, sh, z)
            </p>
          </div>

          {/* Brightness / Warmth */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-[var(--color-text-muted)]">Tone</label>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {brightness === 0 ? "Neutral" : brightness < 0 ? "Warm" : "Bright"}
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={brightness}
              onChange={(e) => handleBrightness(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Warm</span>
              <span>Bright</span>
            </div>
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            Adjusts live during playback. Speed is set during generation.
            Auto-tuning coming in production.
          </p>
        </div>
      )}
    </div>
  );
}
