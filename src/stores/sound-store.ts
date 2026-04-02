import { create } from "zustand";
import localforage from "localforage";
import type { MixingAnalysis, MusicSuggestion, SfxSuggestion } from "../engine/analyze-mixing";

export interface GeneratedSound {
  blobUrl: string;
  peaks: number[];
  durationMs: number;
  generating: boolean;
}

/** Persisted form (blob URLs don't survive reload, so we store the raw Blob) */
interface PersistedSound {
  blob: Blob;
  peaks: number[];
  durationMs: number;
}

const audioDb = localforage.createInstance({ name: "narratu-generated-audio" });

interface SoundState {
  analysis: MixingAnalysis | null;
  analyzing: boolean;
  generated: Record<string, GeneratedSound>;

  setAnalysis: (a: MixingAnalysis) => void;
  setAnalyzing: (b: boolean) => void;
  setGenerated: (id: string, sound: GeneratedSound) => void;
  setGenerating: (id: string, generating: boolean) => void;
  removeGenerated: (id: string) => void;
  updateMusic: (id: string, updated: MusicSuggestion) => void;
  updateSfx: (id: string, updated: SfxSuggestion) => void;
  /** Restore persisted audio from IndexedDB */
  restoreFromDb: () => Promise<void>;
}

export const useSoundStore = create<SoundState>((set, get) => ({
  analysis: null,
  analyzing: false,
  generated: {},

  setAnalysis: (analysis) => set({ analysis, analyzing: false }),
  setAnalyzing: (analyzing) => set({ analyzing }),

  setGenerated: (id, sound) => {
    set((s) => ({ generated: { ...s.generated, [id]: sound } }));
    // Persist blob to IndexedDB (async, fire-and-forget)
    if (sound.blobUrl && !sound.generating) {
      fetch(sound.blobUrl).then((r) => r.blob()).then((blob) => {
        audioDb.setItem(id, { blob, peaks: sound.peaks, durationMs: sound.durationMs } satisfies PersistedSound);
      }).catch(() => {});
    }
  },

  setGenerating: (id, generating) => set((s) => ({
    generated: {
      ...s.generated,
      [id]: s.generated[id]
        ? { ...s.generated[id], generating }
        : { blobUrl: "", peaks: [], durationMs: 0, generating },
    },
  })),

  removeGenerated: (id) => {
    const state = get();
    if (state.generated[id]?.blobUrl) URL.revokeObjectURL(state.generated[id].blobUrl);
    const next = { ...state.generated };
    delete next[id];
    set({ generated: next });
    audioDb.removeItem(id).catch(() => {});
  },

  updateMusic: (id, updated) => set((s) => {
    if (!s.analysis) return s;
    // Clear generated + persisted when customized
    audioDb.removeItem(id).catch(() => {});
    return {
      analysis: { ...s.analysis, music: s.analysis.music.map((m) => m.id === id ? updated : m) },
      generated: (() => { const g = { ...s.generated }; delete g[id]; return g; })(),
    };
  }),

  updateSfx: (id, updated) => set((s) => {
    if (!s.analysis) return s;
    audioDb.removeItem(id).catch(() => {});
    return {
      analysis: { ...s.analysis, sfx: s.analysis.sfx.map((x) => x.id === id ? updated : x) },
      generated: (() => { const g = { ...s.generated }; delete g[id]; return g; })(),
    };
  }),

  async restoreFromDb() {
    const keys = await audioDb.keys();
    const restored: Record<string, GeneratedSound> = {};
    for (const key of keys) {
      const data = await audioDb.getItem<PersistedSound>(key);
      if (data?.blob) {
        const url = URL.createObjectURL(data.blob);
        restored[key] = { blobUrl: url, peaks: data.peaks, durationMs: data.durationMs, generating: false };
      }
    }
    if (Object.keys(restored).length > 0) {
      set((s) => ({ generated: { ...s.generated, ...restored } }));
    }
  },
}));

export type { MusicSuggestion, SfxSuggestion, MixingAnalysis };
