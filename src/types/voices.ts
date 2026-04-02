/** Generic voice descriptor used across all TTS providers. */
export interface PresetVoice {
  id: string;
  name: string;
  provider: string;
  gender?: string;
  age?: string;
  accent?: string;
}
