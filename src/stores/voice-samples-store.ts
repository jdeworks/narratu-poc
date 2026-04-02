import { create } from "zustand";

/**
 * Maps voiceId -> audio sample URLs and metadata for playback.
 * Populated by the DemoPage from the manifest's voiceProfiles.
 */
interface VoiceSample {
  mp3: string;
  v2?: string;
}

interface VoiceNameEntry {
  voiceName: string;
  characterName: string;
  provider?: string;
}

interface VoiceSamplesState {
  samples: Record<string, VoiceSample>;
  voiceNames: Record<string, VoiceNameEntry>;
  /** Character name → sample text used for audio generation */
  sampleTexts: Record<string, string>;
  setSamples: (samples: Record<string, VoiceSample>) => void;
  setVoiceNames: (names: Record<string, VoiceNameEntry>) => void;
  setSampleTexts: (texts: Record<string, string>) => void;
}

export const useVoiceSamplesStore = create<VoiceSamplesState>((set) => ({
  samples: {},
  voiceNames: {},
  sampleTexts: {},
  setSamples: (samples) => set({ samples }),
  setVoiceNames: (voiceNames) => set({ voiceNames }),
  setSampleTexts: (sampleTexts) => set({ sampleTexts }),
}));
