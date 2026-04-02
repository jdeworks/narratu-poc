import { create } from "zustand";

export interface VoiceAssignment {
  voiceId: string;
  voiceName: string;
  source: "preset" | "custom";
}

interface VoiceAssignmentState {
  /** Maps character name -> voice assignment */
  assignments: Record<string, VoiceAssignment>;

  /** Assign a voice to a character. */
  assign: (characterName: string, assignment: VoiceAssignment) => void;

  /** Remove a character's voice assignment. */
  unassign: (characterName: string) => void;

  /** Get which character (if any) has this voice assigned. */
  getAssignedCharacter: (voiceId: string) => string | null;

  /** Check if a voice is currently assigned to any character. */
  isVoiceUsed: (voiceId: string) => boolean;

  /** Clear all assignments. */
  reset: () => void;
}

export const useVoiceAssignmentStore = create<VoiceAssignmentState>(
  (set, get) => ({
    assignments: {},

    assign: (characterName, assignment) =>
      set((s) => ({
        assignments: { ...s.assignments, [characterName]: assignment },
      })),

    unassign: (characterName) =>
      set((s) => {
        const next = { ...s.assignments };
        delete next[characterName];
        return { assignments: next };
      }),

    getAssignedCharacter: (voiceId) => {
      const entries = Object.entries(get().assignments);
      const found = entries.find(([, a]) => a.voiceId === voiceId);
      return found ? found[0] : null;
    },

    isVoiceUsed: (voiceId) => {
      return Object.values(get().assignments).some(
        (a) => a.voiceId === voiceId,
      );
    },

    reset: () => set({ assignments: {} }),
  }),
);
