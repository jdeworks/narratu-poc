import { useMemo, useRef } from "react";
import { useMixerStore } from "../stores/mixer-store";
import { computePeaks } from "../utils/peak-utils";
import { createAudioContext, safeDecode } from "../utils/audio-context";

const PEAKS_PER_SECOND = 50;

interface Props {
  trackId: "music" | "sfx";
}

export default function MixerRegionPanel({ trackId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addRegion = useMixerStore((s) => s.addRegion);
  const allRegions = useMixerStore((s) => s.regions);
  const regions = useMemo(() => allRegions.filter((r) => r.trackId === trackId), [allRegions, trackId]);
  const selectedRegionId = useMixerStore((s) => s.selectedRegionId);
  const removeRegion = useMixerStore((s) => s.removeRegion);
  const cursorMs = useMixerStore((s) => s.cursorMs);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const arrayBuf = await file.arrayBuffer();
    const ctx = createAudioContext();
    const decoded = await safeDecode(ctx, arrayBuf);
    const buckets = Math.max(20, Math.round(decoded.duration * PEAKS_PER_SECOND));
    const peaks = computePeaks(decoded.getChannelData(0), buckets);
    const durationMs = decoded.duration * 1000;
    await ctx.close();

    addRegion({
      id: `${trackId}-${Date.now()}`,
      trackId,
      offsetMs: cursorMs,
      durationMs,
      peaks,
      volume: 1.0,
      loop: false,
      source: "upload",
    });

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  }

  const selected = regions.find((r) => r.id === selectedRegionId);

  return (
    <div className="flex items-center gap-1.5">
      {/* Upload button */}
      <button
        onClick={() => fileRef.current?.click()}
        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        title={`Upload ${trackId === "music" ? "music" : "sound effect"}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />

      {/* Delete selected region */}
      {selected && (
        <button
          onClick={() => removeRegion(selected.id)}
          className="rounded p-1 text-[var(--color-danger)] hover:bg-[var(--color-surface)]"
          title="Remove selected region"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Region count */}
      {regions.length > 0 && (
        <span className="text-[10px] text-[var(--color-text-muted)]">{regions.length}</span>
      )}
    </div>
  );
}
