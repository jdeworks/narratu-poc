/**
 * Global, stable color assignments for speakers.
 * Each character gets ONE color that never changes regardless of context.
 * Narrator always gets a neutral gray. Other characters get distinct hues
 * assigned in order of first registration, with color distance checks
 * to maximize visual separation.
 */

interface PaletteEntry {
  bg: string;
  border: string;
  textDark: string;
  textLight: string;
  // HSL hue for distance calculation
  hue: number;
}

// 12 entries with well-spaced hues (30° apart on the color wheel)
const PALETTE: PaletteEntry[] = [
  { bg: "rgba(56, 189, 248, 0.12)", border: "rgb(56, 189, 248)", textDark: "rgb(125, 211, 252)", textLight: "rgb(3, 105, 161)", hue: 199 },    // sky — sky-700 #0369a1 gives 5.9:1 on white, 5.4:1 on surface
  { bg: "rgba(251, 146, 60, 0.12)", border: "rgb(251, 146, 60)", textDark: "rgb(253, 186, 116)", textLight: "rgb(194, 65, 12)", hue: 27 },      // orange
  { bg: "rgba(167, 139, 250, 0.12)", border: "rgb(167, 139, 250)", textDark: "rgb(196, 181, 253)", textLight: "rgb(109, 40, 217)", hue: 263 },   // violet
  { bg: "rgba(52, 211, 153, 0.12)", border: "rgb(52, 211, 153)", textDark: "rgb(110, 231, 183)", textLight: "rgb(4, 120, 87)", hue: 158 },      // emerald
  { bg: "rgba(251, 113, 133, 0.12)", border: "rgb(251, 113, 133)", textDark: "rgb(253, 164, 175)", textLight: "rgb(190, 18, 60)", hue: 350 },   // rose
  { bg: "rgba(250, 204, 21, 0.12)", border: "rgb(250, 204, 21)", textDark: "rgb(253, 224, 71)", textLight: "rgb(161, 98, 7)", hue: 48 },        // yellow
  { bg: "rgba(45, 212, 191, 0.12)", border: "rgb(45, 212, 191)", textDark: "rgb(94, 234, 212)", textLight: "rgb(15, 118, 110)", hue: 173 },     // teal
  { bg: "rgba(244, 114, 182, 0.12)", border: "rgb(244, 114, 182)", textDark: "rgb(249, 168, 212)", textLight: "rgb(190, 24, 93)", hue: 330 },   // pink
  { bg: "rgba(163, 230, 53, 0.12)", border: "rgb(163, 230, 53)", textDark: "rgb(190, 242, 100)", textLight: "rgb(77, 124, 15)", hue: 83 },      // lime
  { bg: "rgba(99, 102, 241, 0.12)", border: "rgb(99, 102, 241)", textDark: "rgb(165, 180, 252)", textLight: "rgb(67, 56, 202)", hue: 239 },     // indigo
  { bg: "rgba(251, 191, 36, 0.12)", border: "rgb(251, 191, 36)", textDark: "rgb(252, 211, 77)", textLight: "rgb(180, 83, 9)", hue: 43 },        // amber
  { bg: "rgba(34, 211, 238, 0.12)", border: "rgb(34, 211, 238)", textDark: "rgb(103, 232, 249)", textLight: "rgb(14, 116, 144)", hue: 188 },    // cyan
];

const NARRATOR_ENTRY: PaletteEntry = {
  bg: "rgba(148, 163, 184, 0.08)",
  border: "rgb(100, 116, 139)",
  textDark: "rgb(148, 163, 184)",
  textLight: "rgb(71, 85, 105)",
  hue: 215,
};

export interface SpeakerColor {
  bg: string;
  border: string;
  text: string;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function resolve(entry: PaletteEntry): SpeakerColor {
  return {
    bg: entry.bg,
    border: entry.border,
    text: isDarkMode() ? entry.textDark : entry.textLight,
  };
}

/** Circular hue distance (0-180). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

// ── Global color registry ────────────────────────────────────────────────
// Character name → palette index. Persists for the entire session.
const globalAssignments = new Map<string, number>();
const usedIndices = new Set<number>();

/**
 * Register a batch of characters to lock in their colors.
 * Call this once when characters are loaded (analysis result, demo load).
 * Characters are assigned colors that maximize hue distance from already-assigned ones.
 */
export function registerSpeakers(names: string[]): void {
  for (const name of names) {
    if (name === "Narrator") continue;
    if (globalAssignments.has(name)) continue;

    // Find the palette entry with max minimum distance from all used entries
    let bestIdx = -1;
    let bestMinDist = -1;

    for (let i = 0; i < PALETTE.length; i++) {
      if (usedIndices.has(i)) continue;

      // Compute minimum hue distance to any already-used color
      let minDist = Infinity;
      for (const usedIdx of usedIndices) {
        const d = hueDistance(PALETTE[i].hue, PALETTE[usedIdx].hue);
        if (d < minDist) minDist = d;
      }
      // If nothing used yet, all are equally good — pick first available
      if (usedIndices.size === 0) minDist = 360;

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }

    // If all palette entries are used, wrap around
    if (bestIdx === -1) {
      bestIdx = globalAssignments.size % PALETTE.length;
    }

    globalAssignments.set(name, bestIdx);
    usedIndices.add(bestIdx);
  }
}

/**
 * Get the color for a speaker. Stable across the entire session.
 * If the speaker hasn't been registered yet, it gets registered on the fly.
 */
const normalizeKey = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

/** Find the registered name that matches a possibly-mangled input. */
function findRegistered(speaker: string): string | null {
  if (globalAssignments.has(speaker)) return speaker;
  // Fuzzy match: strip punctuation/spaces and compare
  const norm = normalizeKey(speaker);
  for (const name of globalAssignments.keys()) {
    if (normalizeKey(name) === norm) return name;
  }
  return null;
}

export function getSpeakerColor(
  speaker: string,
  _allSpeakers?: string[],
): SpeakerColor {
  if (speaker === "Narrator") return resolve(NARRATOR_ENTRY);

  // Try exact match, then fuzzy match against registered names
  const resolved = findRegistered(speaker);
  if (resolved) {
    return resolve(PALETTE[globalAssignments.get(resolved)!]);
  }

  // Auto-register if truly unknown
  registerSpeakers([speaker]);
  return resolve(PALETTE[globalAssignments.get(speaker)!]);
}
