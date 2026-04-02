/**
 * Chrome Web Speech API TTS engine.
 * Maps character voice traits to pitch/rate combos and generates samples.
 */

export interface VoiceOption {
  id: string;
  label: string;
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

export interface VoicePreview {
  optionId: string;
  audio: Blob;
}

const TRAIT_MODIFIERS: Record<string, { pitch?: number; rate?: number }> = {
  deep: { pitch: -0.4 },
  low: { pitch: -0.3 },
  gravelly: { pitch: -0.3, rate: -0.1 },
  old: { pitch: -0.2, rate: -0.15 },
  tired: { pitch: -0.1, rate: -0.2 },
  slow: { rate: -0.2 },
  measured: { rate: -0.1 },
  calm: { rate: -0.1 },
  warm: { pitch: -0.1 },
  young: { pitch: 0.3 },
  bright: { pitch: 0.2 },
  high: { pitch: 0.3 },
  nervous: { rate: 0.15, pitch: 0.1 },
  excited: { rate: 0.2, pitch: 0.15 },
  fast: { rate: 0.2 },
  soft: { pitch: 0.1, rate: -0.1 },
  gentle: { rate: -0.1 },
  sharp: { rate: 0.1, pitch: 0.1 },
  gruff: { pitch: -0.35, rate: -0.05 },
  expressive: { pitch: 0.1 },
  natural: {},
  clear: {},
  neutral: {},
};

function getAvailableVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
}

export function ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = getAvailableVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      resolve(getAvailableVoices());
    };
  });
}

function computeTraitModifiers(traits: string[]): {
  pitch: number;
  rate: number;
} {
  let pitch = 0;
  let rate = 0;
  for (const trait of traits) {
    const mod = TRAIT_MODIFIERS[trait.toLowerCase()];
    if (mod) {
      pitch += mod.pitch ?? 0;
      rate += mod.rate ?? 0;
    }
  }
  // Clamp to reasonable ranges
  return {
    pitch: Math.max(-0.5, Math.min(0.5, pitch)),
    rate: Math.max(-0.3, Math.min(0.3, rate)),
  };
}

export function generateVoiceOptions(
  characterName: string,
  voiceTraits: string[],
  voices: SpeechSynthesisVoice[],
): VoiceOption[] {
  if (voices.length === 0) return [];

  const base = computeTraitModifiers(voiceTraits);
  const options: VoiceOption[] = [];

  // Pick up to 3 distinct voices
  const picks = selectVoices(voices, 3);

  picks.forEach((voice, i) => {
    const variation = i === 0 ? 0 : i === 1 ? 0.1 : -0.1;
    options.push({
      id: `${characterName}-opt-${i + 1}`,
      label: `${voice.name.split(" ").slice(0, 2).join(" ")} (${describeSettings(base.pitch + variation, base.rate + variation * 0.5)})`,
      voice,
      pitch: clamp(1 + base.pitch + variation, 0.5, 2),
      rate: clamp(1 + base.rate + variation * 0.5, 0.5, 1.5),
    });
  });

  return options;
}

function selectVoices(
  voices: SpeechSynthesisVoice[],
  count: number,
): SpeechSynthesisVoice[] {
  // Prefer non-default voices for variety
  const sorted = [...voices].sort((a, b) => {
    if (a.default && !b.default) return 1;
    if (!a.default && b.default) return -1;
    return 0;
  });
  return sorted.slice(0, count);
}

function describeSettings(pitch: number, rate: number): string {
  const parts: string[] = [];
  if (pitch < -0.2) parts.push("deep");
  else if (pitch > 0.2) parts.push("high");
  if (rate < -0.1) parts.push("slow");
  else if (rate > 0.1) parts.push("fast");
  return parts.length > 0 ? parts.join(", ") : "standard";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function speak(text: string, option: VoiceOption): Promise<void> {
  return new Promise((resolve, reject) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = option.voice;
    utterance.pitch = option.pitch;
    utterance.rate = option.rate;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(e.error));
    speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  speechSynthesis.cancel();
}
