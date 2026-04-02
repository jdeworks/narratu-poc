import { useState, useCallback, useRef, useEffect } from "react";
import { playAudio, stopAudio } from "../utils/audio-player";
import type { CharacterProfile } from "../stores/project-store";

const API_BASE = "http://localhost:4001";

// ── Types ──────────────────────────────────────────────────────────────────

interface Preview {
  generated_voice_id: string;
  permanent_voice_id: string;
  audio_url: string; // blob URL for immediate playback
  sample_file: string; // persisted file path (e.g. "samples/el-vera-custom-1.mp3")
}

interface DesignParams {
  voice_description: string;
  text: string;
  auto_generate_text: boolean;
  guidance_scale: number;
  seed: number | null;
}

type Step = "design" | "preview";

interface DemoData {
  previews: Preview[];
  selectedIndex: number;
  voiceName: string;
  voiceDescription: string;
  sampleText: string;
}

interface Props {
  character: CharacterProfile;
  sampleText: string;
  voiceProfileHint?: string;
  demoMode?: DemoData;
  onSelect: (voiceId: string, voiceName: string, audioUrl: string) => void;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a voice description from character profile.
 * Only describes the VOICE — no character plot details, no specific ages (triggers safety filters).
 */
function buildDefaultDescription(c: CharacterProfile): string {
  const parts: string[] = [];

  const gender = c.gender?.toLowerCase();
  const age = c.age?.toLowerCase();
  if (gender && gender !== "unknown") {
    // Map ages to voice-safe terms (avoid numbers, "child", "teen")
    const voiceAge: Record<string, string> = {
      child: "young", teen: "young", "young adult": "young adult",
      "middle-aged": "middle-aged", elderly: "elderly", old: "elderly",
    };
    const safeAge = age && age !== "unknown" ? (voiceAge[age] ?? age) : "";
    const genderWord = gender === "female" ? "woman" : gender === "male" ? "man" : gender;
    parts.push(safeAge ? `A ${safeAge} ${genderWord}` : `A ${genderWord}`);
  }

  const origin = c.origin?.toLowerCase();
  const dialect = c.dialect?.toLowerCase();
  if (origin && origin !== "unknown" && origin !== "none") {
    parts.push(`with a ${origin} accent`);
  } else if (dialect && dialect !== "unknown" && dialect !== "none") {
    parts.push(`with a ${dialect} accent`);
  }

  if (parts.length > 0) {
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  const traits = c.voiceTraits?.filter((t) => t && t !== "unknown" && t !== "none") ?? [];
  if (traits.length > 0) {
    parts.push(`. Voice qualities: ${traits.join(", ")}`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim() || "A clear, natural speaking voice.";
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CreateVoiceModal({ character, sampleText, voiceProfileHint, demoMode, onSelect, onClose }: Props) {
  const isDemo = !!demoMode;
  const [step, setStep] = useState<Step>(isDemo ? "preview" : "design");

  // Design state — prefer LLM-generated voice profile, fall back to naive builder
  const [params, setParams] = useState<DesignParams>({
    voice_description: demoMode?.voiceDescription || voiceProfileHint || buildDefaultDescription(character),
    text: demoMode?.sampleText || sampleText,
    auto_generate_text: false,
    guidance_scale: 5,
    seed: null,
  });
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<string>("");
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const targetProgress = useRef(0); // actual milestone
  const [designError, setDesignError] = useState<string | null>(null);

  // Creep the progress bar forward slowly toward the target
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => {
      setGeneratingProgress((prev) => {
        const target = targetProgress.current;
        if (prev >= target) return prev;
        // Creep 1-2% toward target, slower as we approach
        const step = Math.max(0.5, (target - prev) * 0.08);
        return Math.min(prev + step, target);
      });
    }, 300);
    return () => clearInterval(interval);
  }, [generating]);

  // Preview state
  const [previews, setPreviews] = useState<Preview[]>(demoMode?.previews ?? []);
  const [selectedPreview, setSelectedPreview] = useState<number | null>(demoMode?.selectedIndex ?? null);
  const [playingPreview, setPlayingPreview] = useState<number | null>(null);
  const [voiceName, setVoiceName] = useState(demoMode?.voiceName || `${character.name} (custom)`);


  // ── Design step ──────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setDesignError(null);

    try {
      // Step 1: Generate voice design previews
      setGeneratingStep("Designing voices from description...");
      targetProgress.current = 22;
      setGeneratingProgress(2);
      const body: Record<string, unknown> = {
        voice_description: params.voice_description,
        // Design API audio is discarded — we only need voice IDs.
        // Auto-generate text to avoid tag issues with the design model.
        auto_generate_text: true,
      };
      if (params.guidance_scale !== 5) body.guidance_scale = params.guidance_scale;
      if (params.seed !== null) body.seed = params.seed;

      const designRes = await fetch(`${API_BASE}/api/elevenlabs/voice-design`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!designRes.ok) {
        const data = await designRes.json().catch(() => ({ error: designRes.statusText }));
        throw new Error(data.error || `Design failed: ${designRes.status}`);
      }
      const designData = await designRes.json();
      const rawPreviews = designData.previews ?? [];
      if (rawPreviews.length === 0) throw new Error("No previews generated");
      targetProgress.current = 30;

      // Step 2: Save ALL preview voices to get permanent IDs
      setGeneratingStep("Saving voice profiles...");
      const savedVoices: { generated_voice_id: string; permanent_voice_id: string }[] = [];
      for (let i = 0; i < rawPreviews.length; i++) {
        const p = rawPreviews[i];
        const saveRes = await fetch(`${API_BASE}/api/elevenlabs/voice-save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voice_name: `${character.name} (option ${i + 1})`,
            voice_description: params.voice_description,
            generated_voice_id: p.generated_voice_id,
            labels: {
              character: character.name,
              source: "narratu-custom",
            },
          }),
        });
        if (!saveRes.ok) {
          const data = await saveRes.json().catch(() => ({ error: saveRes.statusText }));
          throw new Error(`Save voice ${i + 1} failed: ${data.error || saveRes.status}`);
        }
        const saved = await saveRes.json();
        savedVoices.push({
          generated_voice_id: p.generated_voice_id,
          permanent_voice_id: saved.voice_id,
        });
        targetProgress.current = 30 + Math.round(((i + 1) / rawPreviews.length) * 20);
      }

      // Step 3: Generate eleven_v3 TTS for all voices, save as files
      setGeneratingStep("Generating production samples (eleven_v3)...");
      targetProgress.current = 90;
      const charSlug = character.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const ttsResults = await Promise.all(
        savedVoices.map(async (sv, i) => {
          const filename = `el-${charSlug}-custom-${i + 1}.mp3`;
          const ttsRes = await fetch(`${API_BASE}/api/elevenlabs/tts-save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voice_id: sv.permanent_voice_id,
              text: sampleText,
              stability: 1.0,
              similarity_boost: 0.75,
              style: 0.0,
              seed: 42,
              filename,
            }),
          });
          if (!ttsRes.ok) {
            throw new Error(`TTS for ${sv.permanent_voice_id} failed: ${ttsRes.status}`);
          }
          const blob = await ttsRes.blob();
          return {
            blobUrl: URL.createObjectURL(blob),
            file: `samples/${filename}`,
          };
        }),
      );

      targetProgress.current = 100;
      setGeneratingProgress(100);
      setGeneratingStep("Ready!");

      // Build final previews with permanent IDs and v3 audio
      const finalPreviews: Preview[] = savedVoices.map((sv, i) => ({
        generated_voice_id: sv.generated_voice_id,
        permanent_voice_id: sv.permanent_voice_id,
        audio_url: ttsResults[i].blobUrl,
        sample_file: ttsResults[i].file,
      }));

      setPreviews(finalPreviews);
      setSelectedPreview(null);
      setStep("preview");
    } catch (err) {
      setDesignError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [params, character.name, sampleText]);

  // ── Preview step ─────────────────────────────────────────────────────────

  function handlePlayPreview(index: number) {
    if (playingPreview === index) {
      stopAudio();
      setPlayingPreview(null);
      return;
    }
    const url = previews[index]?.audio_url;
    if (!url) return;
    playAudio(url, () => setPlayingPreview(null));
    setPlayingPreview(index);
  }

  // ── Select voice from preview ──────────────────────────────────────────

  function handleSelectVoice() {
    if (selectedPreview === null) return;
    const preview = previews[selectedPreview];

    // Delete unselected voices to keep the account clean
    for (let i = 0; i < previews.length; i++) {
      if (i !== selectedPreview && previews[i].permanent_voice_id) {
        fetch(`${API_BASE}/api/elevenlabs/voice-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: previews[i].permanent_voice_id }),
        }).catch(() => {}); // fire-and-forget
      }
    }

    onSelect(preview.permanent_voice_id, voiceName, preview.audio_url);
  }

  // ── Tab indicators ───────────────────────────────────────────────────────

  const steps: { key: Step; label: string; num: number }[] = [
    { key: "design", label: "Design", num: 1 },
    { key: "preview", label: "Listen", num: 2 },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold">Create custom voice</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              for {character.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-[var(--color-border)]">
          {steps.map((s, i) => (
            <button
              key={s.key}
              disabled={!isDemo && i > stepIndex}
              onClick={() => (isDemo || i <= stepIndex) && setStep(s.key)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                step === s.key
                  ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
                  : i <= stepIndex
                    ? "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                    : "cursor-not-allowed text-[var(--color-text-muted)]"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  i < stepIndex
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                    : step === s.key
                      ? "border border-[var(--color-primary)] text-[var(--color-primary)]"
                      : "border border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {i < stepIndex ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  s.num
                )}
              </span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "design" && (
            <DesignStep
              params={params}
              setParams={setParams}
              character={character}
              generating={generating}
              generatingStep={generatingStep}
              generatingProgress={generatingProgress}
              error={designError}
              onGenerate={handleGenerate}
              disabled={isDemo}
            />
          )}

          {step === "preview" && (
            <PreviewStep
              previews={previews}
              selectedPreview={selectedPreview}
              playingPreview={playingPreview}
              onSelect={isDemo ? () => {} : setSelectedPreview}
              onPlay={handlePlayPreview}
              voiceName={voiceName}
              setVoiceName={isDemo ? () => {} : setVoiceName}
              onConfirm={isDemo ? () => {} : handleSelectVoice}
              disabled={isDemo}
            />
          )}

        </div>
      </div>
    </div>
  );
}

// ── Step 1: Design ─────────────────────────────────────────────────────────

function DesignStep({
  params,
  setParams,
  character,
  generating,
  generatingStep,
  generatingProgress,
  error,
  onGenerate,
  disabled,
}: {
  params: DesignParams;
  setParams: (p: DesignParams) => void;
  character: CharacterProfile;
  generating: boolean;
  generatingStep: string;
  generatingProgress: number;
  error: string | null;
  onGenerate: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Character traits — only show what's not already in the description */}
      {(() => {
        const desc = params.voice_description.toLowerCase();
        const traits: { label: string; value: string }[] = [];

        if (character.gender && character.gender !== "unknown" && !desc.includes(character.gender.toLowerCase()))
          traits.push({ label: "Gender", value: character.gender });
        if (character.age && character.age !== "unknown" && !desc.includes(character.age.toLowerCase()))
          traits.push({ label: "Age", value: character.age });
        if (character.origin && character.origin !== "unknown" && character.origin !== "none" && !desc.includes(character.origin.toLowerCase()))
          traits.push({ label: "Origin", value: character.origin });
        if (character.dialect && character.dialect !== "unknown" && character.dialect !== "none" && !desc.includes(character.dialect.toLowerCase()))
          traits.push({ label: "Dialect", value: character.dialect });
        for (const t of character.voiceTraits ?? []) {
          if (t && t !== "unknown" && t !== "none" && !desc.includes(t.toLowerCase()))
            traits.push({ label: "Trait", value: t });
        }

        if (traits.length === 0) return (
          <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2">
            <span className="text-xs text-[var(--color-text-muted)]">
              All character traits included in description
            </span>
          </div>
        );

        return (
          <div className="rounded-lg bg-[var(--color-bg)] p-3">
            <div className="mb-1.5 text-xs text-[var(--color-text-muted)]">
              Not yet in description — click to add:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {traits.map((t) => (
                <button
                  key={`${t.label}-${t.value}`}
                  onClick={() =>
                    setParams({
                      ...params,
                      voice_description: (params.voice_description.trimEnd().replace(/\.?$/, "") + `. ${t.value}.`).trim(),
                    })
                  }
                  className="cursor-pointer rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  title={`Add "${t.value}" to description`}
                >
                  <span className="text-[var(--color-text-muted)]">{t.label}:</span> {t.value}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Voice description */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
          Voice description
        </label>
        <textarea
          value={params.voice_description}
          onChange={(e) => !disabled && setParams({ ...params, voice_description: e.target.value })}
          readOnly={disabled}
          rows={4}
          className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none ${disabled ? "opacity-60" : ""}`}
          placeholder="Describe the voice you want..."
        />
        <div className="mt-0.5 text-right text-xs text-[var(--color-text-muted)]">
          {params.voice_description.length}/1000
        </div>
      </div>

      {/* Sample text — used for v3 TTS previews */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
          Sample text (for v3 preview)
        </label>
        <textarea
          value={params.text}
          onChange={(e) => !disabled && setParams({ ...params, text: e.target.value })}
          readOnly={disabled}
          rows={3}
          className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none ${disabled ? "opacity-60" : ""}`}
          placeholder="Text the voice will read — supports [pause], [whispers], etc."
        />
      </div>

      {/* Advanced settings */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Advanced settings
        </summary>
        <div className="mt-2 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-[var(--color-text-muted)]">Guidance scale</label>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{params.guidance_scale}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={params.guidance_scale}
              onChange={(e) => setParams({ ...params, guidance_scale: Number(e.target.value) })}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Creative</span>
              <span>Literal</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Seed (optional)</label>
            <input
              type="number"
              value={params.seed ?? ""}
              onChange={(e) => setParams({ ...params, seed: e.target.value ? Number(e.target.value) : null })}
              placeholder="Random"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
        </div>
      </details>

      {/* API request preview */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          API request preview
        </summary>
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs font-mono font-medium text-[var(--color-primary)]">
              POST
            </span>
            <span className="text-xs font-mono text-[var(--color-text-muted)]">
              /v1/text-to-voice/create-previews
            </span>
          </div>
          <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-surface)] p-2.5 text-xs leading-relaxed font-mono text-[var(--color-text-secondary)]">
            {JSON.stringify(
              {
                voice_description: params.voice_description || "<voice_description>",
                auto_generate_text: true,
                ...(params.guidance_scale !== 5
                  ? { guidance_scale: params.guidance_scale }
                  : {}),
                ...(params.seed !== null ? { seed: params.seed } : {}),
              },
              null,
              2,
            )}
          </pre>
          <div className="mt-2 border-t border-[var(--color-border)] pt-2">
            <div className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
              Then on confirm, saves + generates with:
            </div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs font-mono font-medium text-[var(--color-primary)]">
                POST
              </span>
              <span className="text-xs font-mono text-[var(--color-text-muted)]">
                /v1/text-to-voice/create-voice-from-preview
              </span>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-surface)] p-2.5 text-xs leading-relaxed font-mono text-[var(--color-text-secondary)]">
              {JSON.stringify(
                {
                  voice_name: `${character.name} (custom)`,
                  voice_description: params.voice_description || "<voice_description>",
                  generated_voice_id: "<selected_preview_id>",
                  labels: {
                    character: character.name,
                    gender: character.gender || undefined,
                    age: character.age || undefined,
                    source: "narratu-custom",
                  },
                },
                null,
                2,
              )}
            </pre>
            <div className="mt-2 mb-1 flex items-center gap-2">
              <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs font-mono font-medium text-[var(--color-primary)]">
                POST
              </span>
              <span className="text-xs font-mono text-[var(--color-text-muted)]">
                /v1/text-to-speech/{"<voice_id>"}
              </span>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-surface)] p-2.5 text-xs leading-relaxed font-mono text-[var(--color-text-secondary)]">
              {JSON.stringify(
                {
                  text: (params.text || "<sample_text>").slice(0, 60) + "...",
                  model_id: "eleven_v3",
                  voice_settings: {
                    stability: 1.0,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                  },
                  seed: 42,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>
      </details>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-xs text-[var(--color-danger-text)]">
          {error}
        </div>
      )}

      {/* Generate button / progress */}
      {generating ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-secondary)]">{generatingStep}</span>
            <span className="text-[var(--color-text-muted)]">{generatingProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
              style={{ width: `${generatingProgress}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={onGenerate}
          disabled={disabled || params.voice_description.length < 20}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            disabled || params.voice_description.length < 20
              ? "cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-muted)]"
              : "cursor-pointer bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
          }`}
        >
          {disabled ? "Generation disabled in demo" : "Generate voice samples"}
        </button>
      )}
    </div>
  );
}

// ── Step 2: Preview ────────────────────────────────────────────────────────

function PreviewStep({
  previews,
  selectedPreview,
  playingPreview,
  onSelect,
  onPlay,
  voiceName,
  setVoiceName,
  onConfirm,
  disabled,
}: {
  previews: Preview[];
  selectedPreview: number | null;
  playingPreview: number | null;
  onSelect: (i: number) => void;
  onPlay: (i: number) => void;
  voiceName: string;
  setVoiceName: (n: string) => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-text-muted)]">
        {disabled
          ? "These samples were generated with eleven_v3 (production model). The selected voice is highlighted."
          : "All samples generated with eleven_v3 (production model). Pick the voice you like best."}
      </p>

      {/* Preview cards */}
      <div className="space-y-2">
        {previews.map((preview, i) => (
          <div
            key={preview.permanent_voice_id}
            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
              selectedPreview === i
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
            }`}
          >
            {/* Play button */}
            <button
              onClick={() => onPlay(i)}
              className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
                playingPreview === i
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                  : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {playingPreview === i ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[var(--color-text-secondary)]">
                Voice {i + 1}
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                eleven_v3
              </div>
            </div>

            {/* Select radio */}
            <button
              onClick={() => onSelect(i)}
              className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
                selectedPreview === i
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              {selectedPreview === i && (
                <div className="h-2 w-2 rounded-full bg-[var(--color-primary-text)]" />
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Voice name input */}
      {selectedPreview !== null && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            Voice name
          </label>
          <input
            type="text"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            readOnly={disabled}
            className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none ${disabled ? "opacity-60" : ""}`}
          />
        </div>
      )}

      {/* Actions */}
      {!disabled && (
        <div className="flex gap-2">
          <button
            disabled
            className="cursor-not-allowed rounded-lg border border-dashed border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-muted)]"
            title="Regenerate with different voices. Available in production."
          >
            Regenerate
          </button>
          <button
            onClick={onConfirm}
            disabled={selectedPreview === null}
            className={`flex-1 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
              selectedPreview === null
                ? "cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-muted)]"
                : "cursor-pointer bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
            }`}
          >
            Use this voice
          </button>
        </div>
      )}
      {disabled && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Voice selection and regeneration available in production.
        </p>
      )}
    </div>
  );
}

