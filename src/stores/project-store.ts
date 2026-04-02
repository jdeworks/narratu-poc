import { create } from "zustand";
import { saveProject, type SavedProject } from "../storage/project-db";
import { registerSpeakers } from "../utils/speaker-colors";

export type AppView =
  | "input"
  | "processing"
  | "editor"
  | "generating"
  | "playback"
  | "investors"
  | "survey"
  | "how-it-works"
  | "demo";

export interface CharacterProfile {
  name: string;
  description: string;
  gender: string;
  age: string;
  origin: string;
  dialect: string;
  voiceTraits: string[];
}

export interface TextSegment {
  id: string;
  speaker: string;
  originalText: string;
  voiceText: string;
  inflection: string;
  emotion: string;
  trailingSilence?: number;
}

/** Enrichment data from pass 2 (relationships + voice profiles) */
export interface EnrichmentData {
  mermaid: string;
  voiceProfiles: Record<string, string>;
}

/** Stored voice match from ElevenLabs shared voices */
export interface StoredVoiceMatch {
  voice_id: string;
  name: string;
  gender: string;
  age: string;
  accent: string;
  descriptive: string;
  description: string;
  preview_url: string;
  category: string;
  score: number;
  reasons: string[];
}

/** Maps character name → top matched voices */
export type VoiceMatches = Record<string, StoredVoiceMatch[]>;

/** Maps character name → selected voice option ID */
export type VoiceSelections = Record<string, string>;

export interface ProjectState {
  projectId: string | null;
  projectName: string;
  view: AppView;
  storyText: string;
  segments: TextSegment[];
  characters: CharacterProfile[];
  voiceSelections: VoiceSelections;
  voiceMatches: VoiceMatches;
  enrichment: EnrichmentData | null;
  /** Audio URLs per segment (set after voice generation) */
  segmentAudioUrls: Record<string, string>;
  setView: (view: AppView) => void;
  setStoryText: (text: string) => void;
  setSegments: (segments: TextSegment[]) => void;
  setCharacters: (characters: CharacterProfile[]) => void;
  setVoiceSelection: (characterName: string, optionId: string) => void;
  setProjectName: (name: string) => void;
  setEnrichment: (data: EnrichmentData) => void;
  setVoiceMatches: (matches: VoiceMatches) => void;
  setSegmentAudioUrls: (urls: Record<string, string>) => void;
  loadDemoData: (characters: CharacterProfile[], segments: TextSegment[], enrichment?: EnrichmentData, voiceMatches?: VoiceMatches) => void;
  loadProject: (project: SavedProject) => void;
  autoSave: () => Promise<void>;
  reset: () => void;
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  projectName: "Untitled",
  view: "input",
  storyText: "",
  segments: [],
  characters: [],
  voiceSelections: {},
  voiceMatches: {},
  enrichment: null,
  segmentAudioUrls: {},

  setView: (view) => set({ view }),
  setStoryText: (storyText) => set({ storyText }),
  setSegments: (segments) => {
    set({ segments });
    get().autoSave();
  },
  setCharacters: (characters) => {
    registerSpeakers(characters.map((c) => c.name));
    set({ characters });
    get().autoSave();
  },
  setVoiceSelection: (characterName, optionId) => {
    const prev = get().voiceSelections;
    set({ voiceSelections: { ...prev, [characterName]: optionId } });
    get().autoSave();
  },
  setProjectName: (projectName) => {
    set({ projectName });
    get().autoSave();
  },

  setEnrichment: (enrichment) => {
    set({ enrichment });
    get().autoSave();
  },
  setSegmentAudioUrls: (segmentAudioUrls) => set({ segmentAudioUrls }),

  setVoiceMatches: (voiceMatches) => {
    set({ voiceMatches });
    get().autoSave();
  },

  /** Load data for display only (demo mode). Does NOT trigger autoSave. */
  loadDemoData: (characters, segments, enrichment, voiceMatches) => {
    registerSpeakers(characters.map((c) => c.name));
    set({ characters, segments, enrichment: enrichment ?? null, voiceMatches: voiceMatches ?? {} });
  },

  loadProject: (project) => {
    registerSpeakers(project.characters.map((c) => c.name));
    set({
      projectId: project.id,
      projectName: project.name,
      view: project.segments.length > 0 ? "editor" : "input",
      storyText: project.storyText,
      segments: project.segments,
      characters: project.characters,
      voiceSelections: {},
    });
  },

  autoSave: async () => {
    const s = get();
    // Only save if we have meaningful content
    if (!s.storyText && s.segments.length === 0) return;

    const id = s.projectId || generateId();
    if (!s.projectId) set({ projectId: id });

    const name =
      s.projectName === "Untitled" && s.storyText
        ? s.storyText.slice(0, 40).trim() + "..."
        : s.projectName;

    await saveProject({
      id,
      name,
      storyText: s.storyText,
      characters: s.characters,
      segments: s.segments,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },

  reset: () =>
    set({
      projectId: null,
      projectName: "Untitled",
      view: "input",
      storyText: "",
      segments: [],
      characters: [],
      voiceSelections: {},
      voiceMatches: {},
      enrichment: null,
      segmentAudioUrls: {},
    }),
}));
