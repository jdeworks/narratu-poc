/**
 * AI Analysis tab for music/SFX placement suggestions.
 * Analyzes story structure to recommend where background music
 * and sound effects should be placed.
 */

import { useMemo } from "react";
import type { TextSegment, CharacterProfile } from "../stores/project-store";
import { getSpeakerColor } from "../utils/speaker-colors";
import { useSoundStore } from "../stores/sound-store";

interface Props {
  segments: TextSegment[];
  characters: CharacterProfile[];
  allSpeakers: string[];
  onOpenSidebar?: () => void;
}

export default function AnalysisMixingTab({ segments, characters, allSpeakers, onOpenSidebar }: Props) {
  const analysis = useSoundStore((s) => s.analysis);
  const analyzing = useSoundStore((s) => s.analyzing);

  // Use LLM analysis if available, otherwise fall back to heuristic
  const music = analysis?.music ?? [];
  const sfx = analysis?.sfx ?? [];
  const hasLlm = analysis !== null;

  // Heuristic fallback for display only
  const heuristicSugs = useMemo(() => !hasLlm ? analyzeForMixing(segments, characters) : [], [segments, characters, hasLlm]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-secondary)]">
          AI analysis for music and sound effect placement.
        </p>
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            Open in Sidebar
          </button>
        )}
      </div>

      {analyzing && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--color-panel-bg)] p-4 text-sm text-[var(--color-text-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          Running LLM mixing analysis...
        </div>
      )}

      {/* LLM results */}
      {hasLlm && (
        <>
          <Section title="Background Music" count={music.length}>
            {music.map((m) => (
              <div key={m.id} className="rounded-lg border border-[var(--color-border)]/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--color-origin-analyzed-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-origin-analyzed)]">Music</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">{m.title}</span>
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">{m.placements.length} placement{m.placements.length > 1 ? "s" : ""}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{m.mood} &middot; vol {m.volume} &middot; fade {m.fadeInMs}/{m.fadeOutMs}ms</p>
                <div className="mt-2 rounded bg-[var(--color-bg)] p-2">
                  <p className="font-mono text-[10px] text-[var(--color-text-muted)]">{m.prompt}</p>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.placements.map((p, i) => (
                    <span key={i} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                      {p.startSegment}→{p.endSegment}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Sound Effects" count={sfx.length}>
            {sfx.map((s) => (
              <div key={s.id} className="rounded-lg border border-[var(--color-border)]/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--color-origin-user-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-origin-user)]">SFX</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">{s.title}</span>
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">{s.segmentId}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {s.timing} of &ldquo;<span className="italic">{s.atWords}</span>&rdquo; &middot; {s.durationSec}s &middot; vol {s.volume}
                </p>
                <div className="mt-2 rounded bg-[var(--color-bg)] p-2">
                  <p className="font-mono text-[10px] text-[var(--color-text-muted)]">{s.prompt}</p>
                </div>
              </div>
            ))}
          </Section>
        </>
      )}

      {/* Heuristic fallback */}
      {!hasLlm && !analyzing && heuristicSugs.length > 0 && (
        <>
          <div className="rounded-lg bg-[var(--color-panel-bg)] p-2 text-xs text-[var(--color-text-muted)]">
            Showing heuristic analysis (LLM not available). Run with dev:api for LLM-powered results.
          </div>
          <Section title="Heuristic Suggestions" count={heuristicSugs.length}>
            {heuristicSugs.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} segments={segments} allSpeakers={allSpeakers} />
            ))}
          </Section>
        </>
      )}

      <div className="rounded-lg bg-[var(--color-panel-bg)] p-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          {hasLlm ? "LLM analysis complete. Open in Sidebar to generate audio and add to mixer."
            : "Connect to dev:api or enter an API key for LLM-powered mixing analysis."}
        </p>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">{title} ({count})</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface HeuristicSuggestion {
  id: string; type: "music" | "sfx"; segmentRange: [number, number];
  title: string; description: string; prompt: string; mood: string;
}

function SuggestionCard({ suggestion: s, segments, allSpeakers }: {
  suggestion: HeuristicSuggestion; segments: TextSegment[]; allSpeakers: string[];
}) {
  const startSeg = segments[s.segmentRange[0]];
  const endSeg = segments[s.segmentRange[1]];
  const color = startSeg ? getSpeakerColor(startSeg.speaker, allSpeakers) : null;

  return (
    <div className="rounded-lg border border-[var(--color-border)]/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              s.type === "music"
                ? "bg-[var(--color-origin-analyzed-bg)] text-[var(--color-origin-analyzed)]"
                : "bg-[var(--color-origin-user-bg)] text-[var(--color-origin-user)]"
            }`}>
              {s.type === "music" ? "Music" : "SFX"}
            </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{s.title}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{s.description}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
          Seg {s.segmentRange[0] + 1}–{s.segmentRange[1] + 1}
        </span>
      </div>
      <div className="mt-2 rounded bg-[var(--color-bg)] p-2">
        <div className="mb-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">Generation prompt</div>
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">{s.prompt}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        <span>Mood: {s.mood}</span>
        {startSeg && <span style={{ color: color?.border }}>Start: {startSeg.speaker}</span>}
        {endSeg && startSeg !== endSeg && <span>→ {endSeg.speaker}</span>}
      </div>
    </div>
  );
}

// ── Full story mixing analysis ───────────────────────────────────────────

function analyzeForMixing(segments: TextSegment[], _characters: CharacterProfile[]): HeuristicSuggestion[] {
  const suggestions: HeuristicSuggestion[] = [];
  let id = 0;
  const used = new Set<number>(); // track which segments already have music

  // ── MUSIC PASSES ──────────────────────────────────────────────────────

  // 1. Opening — narrator intro
  const firstNonNarrator = segments.findIndex((s, i) => i > 0 && s.speaker !== "Narrator");
  const openEnd = firstNonNarrator > 0 ? firstNonNarrator - 1 : 2;
  suggestions.push({
    id: `mix-${id++}`, type: "music",
    segmentRange: [0, Math.min(openEnd, segments.length - 1)],
    title: "Opening theme",
    description: "Sets the mood as the narrator introduces the story and characters.",
    prompt: "Soft ambient piano with light strings, literary atmosphere, inviting and slightly mysterious, period drama feel",
    mood: "atmospheric, inviting",
  });
  for (let i = 0; i <= openEnd; i++) used.add(i);

  // 2. Dialogue scenes — detect character conversation blocks (3+ back-and-forth)
  let i = 0;
  while (i < segments.length) {
    if (used.has(i) || segments[i].speaker === "Narrator") { i++; continue; }
    // Find conversation block: alternating non-narrator speakers
    let end = i;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].speaker === "Narrator" && j - i < 3) continue; // narrator interjections ok
      if (segments[j].speaker !== "Narrator" || j - end > 2) end = j;
      if (segments[j].speaker === "Narrator" && j - end >= 2) break;
    }
    if (end - i >= 3 && !rangeOverlaps(i, end, used)) {
      const speakers = [...new Set(segments.slice(i, end + 1).filter((s) => s.speaker !== "Narrator").map((s) => s.speaker))];
      const mood = dominantEmotion(segments.slice(i, end + 1));
      suggestions.push({
        id: `mix-${id++}`, type: "music",
        segmentRange: [i, end],
        title: `Dialogue: ${speakers.slice(0, 2).join(" & ")}`,
        description: `${end - i + 1} segments of conversation. Mood: ${mood}.`,
        prompt: `Very soft, minimal ${mood.includes("tense") ? "suspenseful" : "warm"} underscore, subtle enough to sit behind dialogue, ${mood} atmosphere`,
        mood,
      });
      for (let j = i; j <= end; j++) used.add(j);
      i = end + 1;
      continue;
    }
    i++;
  }

  // 3. Dramatic arcs — emotion-based blocks
  for (let j = 0; j < segments.length; j++) {
    if (used.has(j)) continue;
    const emo = segments[j].emotion.toLowerCase();
    if (emo.includes("dramatic") || emo.includes("tense") || emo.includes("suspense") || emo.includes("shock")) {
      let end = j;
      for (let k = j + 1; k < segments.length && k < j + 12; k++) {
        const e2 = segments[k].emotion.toLowerCase();
        if (e2.includes("dramatic") || e2.includes("tense") || e2.includes("suspense") || e2.includes("shock")) end = k;
        else break;
      }
      suggestions.push({
        id: `mix-${id++}`, type: "music",
        segmentRange: [j, end],
        title: "Dramatic tension",
        description: `${end - j + 1} segments building ${emo} tension.`,
        prompt: `Tense, suspenseful ambient drone with subtle dissonant strings, building unease, ${emo}`,
        mood: emo,
      });
      for (let k = j; k <= end; k++) used.add(k);
      j = end;
    }
  }

  // 4. Ambient bed for remaining long narrator blocks
  let blockStart = -1;
  for (let j = 0; j <= segments.length; j++) {
    const isNarrator = j < segments.length && segments[j].speaker === "Narrator" && !used.has(j);
    if (isNarrator && blockStart < 0) blockStart = j;
    if (!isNarrator && blockStart >= 0) {
      const blockLen = j - blockStart;
      if (blockLen >= 3) {
        const mood = dominantEmotion(segments.slice(blockStart, j));
        suggestions.push({
          id: `mix-${id++}`, type: "music",
          segmentRange: [blockStart, j - 1],
          title: "Narrator ambient",
          description: `${blockLen} narrator segments. Light ambient bed.`,
          prompt: `Very quiet ambient pad, barely noticeable background texture, ${mood}, literary reading atmosphere`,
          mood,
        });
      }
      blockStart = -1;
    }
  }

  // 5. Closing — last narrator block
  let closingStart = segments.length - 1;
  while (closingStart > 0 && segments[closingStart].speaker === "Narrator") closingStart--;
  closingStart++;
  if (closingStart < segments.length - 1) {
    suggestions.push({
      id: `mix-${id++}`, type: "music",
      segmentRange: [closingStart, segments.length - 1],
      title: "Closing theme",
      description: "Concluding music as the story wraps up.",
      prompt: "Gentle resolution, fading piano with warm strings, slightly wistful, story ending",
      mood: "reflective, concluding",
    });
  }

  // ── SFX PASSES (deduplicated) ─────────────────────────────────────────

  const sfxByType = new Map<string, { indices: number[]; pattern: SfxPattern }>();

  for (let j = 0; j < segments.length; j++) {
    const text = (segments[j].originalText + " " + segments[j].voiceText).toLowerCase();
    for (const sfx of SFX_PATTERNS) {
      if (sfx.regex.test(text)) {
        const key = sfx.key;
        const entry = sfxByType.get(key) ?? { indices: [], pattern: sfx };
        entry.indices.push(j);
        sfxByType.set(key, entry);
        break;
      }
    }
  }

  // Group adjacent segment indices into ranges, create one suggestion per group
  for (const [, { indices, pattern }] of sfxByType) {
    const groups = groupAdjacentIndices(indices, 3); // merge if within 3 segments
    for (const group of groups) {
      const first = group[0];
      const seg = segments[first];
      // Context-aware prompt: include speaker and scene info
      const context = seg.speaker !== "Narrator" ? `during ${seg.speaker}'s dialogue` : "narrated scene";
      suggestions.push({
        id: `mix-${id++}`, type: "sfx",
        segmentRange: [first, group[group.length - 1]],
        title: `${pattern.title}${group.length > 1 ? ` (x${group.length})` : ""}`,
        description: `${pattern.description}, ${context}.`,
        prompt: `${pattern.prompt}, ${context}, ${seg.emotion.toLowerCase()} mood`,
        mood: pattern.mood,
      });
    }
  }

  return suggestions;
}

interface SfxPattern { key: string; regex: RegExp; title: string; description: string; prompt: string; mood: string }

const SFX_PATTERNS: SfxPattern[] = [
  { key: "door", regex: /\b(knock|door|open.*door|close.*door)\b/i, title: "Door", description: "Door opening, closing, or knocking", prompt: "Wooden door creak, old house, subtle", mood: "neutral" },
  { key: "footsteps", regex: /\b(footstep|walk|approach|enter|came in|strode|hurried)\b/i, title: "Footsteps", description: "Someone approaching or moving", prompt: "Soft footsteps on floor, period house", mood: "neutral" },
  { key: "window", regex: /\b(window|glass|pane|french window)\b/i, title: "Window", description: "Window-related ambient", prompt: "Window pane atmosphere, old house", mood: "atmospheric" },
  { key: "weather", regex: /\b(rain|storm|thunder|wind|cold|chill)\b/i, title: "Weather", description: "Weather atmosphere", prompt: "Weather ambient, subtle outdoor sounds", mood: "atmospheric" },
  { key: "nature", regex: /\b(bird|garden|lawn|outside|field|marsh|bog|snipe|song)\b/i, title: "Nature", description: "Outdoor sounds", prompt: "English countryside ambient, nature sounds", mood: "pastoral" },
  { key: "gasp", regex: /\b(scream|shriek|gasp|shock|horror|dazed)\b/i, title: "Reaction", description: "Dramatic reaction", prompt: "Sharp dramatic moment, room tension", mood: "dramatic" },
  { key: "tea", regex: /\b(tea|cup|saucer|pour|sandwich|cake)\b/i, title: "Tea service", description: "Domestic tea sounds", prompt: "Teacup on saucer, quiet domestic setting", mood: "domestic" },
  { key: "hunting", regex: /\b(gun|shoot|hunting|sport|spaniel|retriever|mackintosh|coat)\b/i, title: "Hunting return", description: "Hunting party sounds", prompt: "Men returning from hunt, dogs, outdoor boots", mood: "lively" },
  { key: "clock", regex: /\b(clock|time|hour|dusk|evening|afternoon|twilight)\b/i, title: "Time passing", description: "Clock or time ambient", prompt: "Grandfather clock ticking, quiet room, time passing", mood: "contemplative" },
  { key: "silence", regex: /\b(silence|pause|quiet|still|awkward)\b/i, title: "Tense silence", description: "Uncomfortable quiet", prompt: "Room tone, uncomfortable silence, clock ticking faintly", mood: "tense" },
];

function dominantEmotion(segs: TextSegment[]): string {
  const counts = new Map<string, number>();
  for (const s of segs) {
    const e = s.emotion.toLowerCase();
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  let best = "neutral";
  let max = 0;
  for (const [e, c] of counts) { if (c > max) { best = e; max = c; } }
  return best;
}

function rangeOverlaps(start: number, end: number, used: Set<number>): boolean {
  let overlap = 0;
  for (let i = start; i <= end; i++) if (used.has(i)) overlap++;
  return overlap > (end - start + 1) * 0.5;
}

function groupAdjacentIndices(indices: number[], maxGap: number): number[][] {
  if (indices.length === 0) return [];
  const sorted = [...indices].sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= maxGap) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  return groups;
}
