import { create } from "zustand";
import type { PeakData } from "../utils/peak-utils";

export interface MixerSegment {
  id: string;
  speaker: string;
  offsetMs: number;
  durationMs: number;
  /** Original full duration before earlyStopMs (for computing effective duration) */
  rawDurationMs: number;
  gapBeforeMs: number;
  peaks: number[];
}

export interface MixerRegion {
  id: string;
  trackId: "music" | "sfx";
  offsetMs: number;
  durationMs: number;
  /** Actual audio clip duration (for loop toggle — clip vs fill) */
  clipDurationMs?: number;
  /** Original placement span duration (for restoring after loop off→on) */
  placementDurationMs?: number;
  peaks: number[];
  volume: number;
  loop: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  source: "upload" | "elevenlabs-sfx" | "elevenlabs-music" | "cc0";
  prompt?: string;
}

interface MixerState {
  // Loading
  loading: boolean;
  loadProgress: { current: number; total: number };

  // Layout
  segments: MixerSegment[];
  regions: MixerRegion[];
  totalDurationMs: number;

  // View
  zoom: number;          // px per second
  scrollLeft: number;    // px
  cursorMs: number;
  selectedSegmentId: string | null;
  selectedRegionId: string | null;

  // Playback
  playbackState: "stopped" | "playing" | "paused";

  // Actions
  setLoading: (loading: boolean, progress?: { current: number; total: number }) => void;
  setSegments: (segments: MixerSegment[]) => void;
  addSegment: (segment: MixerSegment) => void;
  setZoom: (zoom: number) => void;
  setScrollLeft: (px: number) => void;
  setCursorMs: (ms: number) => void;
  selectSegment: (id: string | null) => void;
  selectRegion: (id: string | null) => void;
  setPlaybackState: (state: "stopped" | "playing" | "paused") => void;
  addRegion: (region: MixerRegion) => void;
  moveRegion: (id: string, newOffsetMs: number) => void;
  updateRegion: (id: string, updates: Partial<MixerRegion>) => void;
  splitRegion: (id: string, atMs: number) => void;
  removeRegion: (id: string) => void;
}

export const useMixerStore = create<MixerState>((set) => ({
  loading: false,
  loadProgress: { current: 0, total: 0 },
  segments: [],
  regions: [],
  totalDurationMs: 0,
  zoom: 50, // 50px per second default
  scrollLeft: 0,
  cursorMs: 0,
  selectedSegmentId: null,
  selectedRegionId: null,
  playbackState: "stopped",

  setLoading: (loading, progress) => set((s) => ({
    loading,
    loadProgress: progress ?? s.loadProgress,
  })),

  setSegments: (segments) => {
    const last = segments[segments.length - 1];
    const totalDurationMs = last ? last.offsetMs + last.durationMs : 0;
    set({ segments, totalDurationMs });
  },

  addSegment: (segment) => set((s) => {
    const segs = [...s.segments, segment];
    const last = segs[segs.length - 1];
    return { segments: segs, totalDurationMs: last ? last.offsetMs + last.durationMs : 0 };
  }),

  setZoom: (zoom) => set((s) => {
    const z = Math.max(0.5, Math.min(500, zoom));
    // Center viewport on the cursor after zoom
    const viewportW = 800; // approximate
    const cursorPx = msToPixels(s.cursorMs, z);
    const idealScroll = cursorPx - viewportW / 2;
    const maxScroll = Math.max(0, msToPixels(s.totalDurationMs + 2000, z) - viewportW);
    return { zoom: z, scrollLeft: Math.max(0, Math.min(idealScroll, maxScroll)) };
  }),
  setScrollLeft: (scrollLeft) => set({ scrollLeft: Math.max(0, scrollLeft) }),
  setCursorMs: (cursorMs) => set({ cursorMs: Math.max(0, cursorMs) }),
  selectSegment: (id) => set({ selectedSegmentId: id, selectedRegionId: null }),
  selectRegion: (id) => set({ selectedRegionId: id, selectedSegmentId: null }),
  setPlaybackState: (playbackState) => set({ playbackState }),

  addRegion: (region) => set((s) => ({ regions: [...s.regions, region] })),
  moveRegion: (id, newOffsetMs) => set((s) => ({
    regions: s.regions.map((r) => r.id === id ? { ...r, offsetMs: Math.max(0, newOffsetMs) } : r),
  })),
  updateRegion: (id, updates) => set((s) => ({
    regions: s.regions.map((r) => r.id === id ? { ...r, ...updates } : r),
  })),

  splitRegion: (id, atMs) => set((s) => {
    const region = s.regions.find((r) => r.id === id);
    if (!region || atMs <= region.offsetMs || atMs >= region.offsetMs + region.durationMs) return s;
    const splitPoint = atMs - region.offsetMs;
    const left: MixerRegion = { ...region, durationMs: splitPoint };
    const right: MixerRegion = {
      ...region,
      id: `${region.id}-split-${Date.now()}`,
      offsetMs: atMs,
      durationMs: region.durationMs - splitPoint,
    };
    return { regions: s.regions.map((r) => r.id === id ? left : r).concat(right) };
  }),

  removeRegion: (id) => set((s) => ({
    regions: s.regions.filter((r) => r.id !== id),
  })),
}));

/** Convert time (ms) to pixel position at given zoom */
export function msToPixels(ms: number, zoom: number): number {
  return (ms / 1000) * zoom;
}

/** Convert pixel position to time (ms) at given zoom */
export function pixelsToMs(px: number, zoom: number): number {
  return (px / zoom) * 1000;
}
