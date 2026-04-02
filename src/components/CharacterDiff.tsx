import { useState } from "react";
import type { CharacterProfile, StoredVoiceMatch } from "../stores/project-store";
import { getSpeakerColor } from "../utils/speaker-colors";

interface Props {
  character: CharacterProfile;
  defaultCharacter: CharacterProfile;
  allSpeakers: string[];
  voiceSelection?: { voiceId: string; voiceName: string; source: string };
  voiceMatches?: StoredVoiceMatch[];
  segmentCount: number;
}

const FIELDS: (keyof CharacterProfile)[] = ["description", "gender", "age", "origin", "dialect"];

export default function CharacterDiff({ character, defaultCharacter, allSpeakers, voiceSelection, voiceMatches, segmentCount }: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = getSpeakerColor(character.name, allSpeakers);

  const diffs = FIELDS.filter((f) => character[f] !== defaultCharacter[f]);
  const traitsDiff = JSON.stringify(character.voiceTraits) !== JSON.stringify(defaultCharacter.voiceTraits);

  // Voice change: selecting outside top 3 or custom-created counts as no change
  const top3 = voiceMatches?.slice(0, 3) ?? [];
  const isVoiceFromTop3 = voiceSelection
    ? top3.some((m) => m.voice_id === voiceSelection.voiceId)
    : false;
  const isCustomCreated = voiceSelection?.source === "custom";
  const isVoiceChanged = voiceSelection && !isVoiceFromTop3 && !isCustomCreated;

  const totalChanges = diffs.length + (traitsDiff ? 1 : 0) + (isVoiceChanged ? 1 : 0);

  return (
    <div className="rounded-lg border border-[var(--color-border)]/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-sm font-medium" style={{ color: color.text }}>{character.name}</span>
        <span className="text-sm text-[var(--color-text-muted)]">{segmentCount} seg</span>
        {voiceSelection && (
          <span className="ml-1 text-sm text-[var(--color-text-secondary)]">{voiceSelection.voiceName}</span>
        )}
        {totalChanges > 0 && (
          <span className="ml-auto rounded-full bg-[var(--color-origin-user)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-origin-user)]">
            {totalChanges} changed
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)]/30 px-3 py-2 space-y-3">
          {/* Voice selection row */}
          <VoiceRow
            voiceSelection={voiceSelection}
            voiceMatches={voiceMatches}
            isFromTop3={isVoiceFromTop3}
            isCustom={isCustomCreated}
          />

          {/* Field comparison table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--color-text-muted)]">
                <th className="pb-1 text-left font-medium">Field</th>
                <th className="pb-1 text-left font-medium">Default</th>
                <th className="pb-1 text-left font-medium">Current</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((field) => {
                const isChanged = character[field] !== defaultCharacter[field];
                return (
                  <tr key={field} className={isChanged ? "bg-[var(--color-origin-user)]/5" : ""}>
                    <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">{field}</td>
                    <td className="py-0.5 pr-2 text-[var(--color-text-secondary)]">{truncate(String(defaultCharacter[field]), 40)}</td>
                    <td className={`py-0.5 ${isChanged ? "font-medium text-[var(--color-origin-user)]" : "text-[var(--color-text-secondary)]"}`}>
                      {truncate(String(character[field]), 40)}
                    </td>
                  </tr>
                );
              })}
              <tr className={traitsDiff ? "bg-[var(--color-origin-user)]/5" : ""}>
                <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">voiceTraits</td>
                <td className="py-0.5 pr-2 text-[var(--color-text-secondary)]">{defaultCharacter.voiceTraits.join(", ")}</td>
                <td className={`py-0.5 ${traitsDiff ? "font-medium text-[var(--color-origin-user)]" : "text-[var(--color-text-secondary)]"}`}>
                  {character.voiceTraits.join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VoiceRow({ voiceSelection, voiceMatches, isFromTop3, isCustom }: {
  voiceSelection?: { voiceId: string; voiceName: string; source: string };
  voiceMatches?: StoredVoiceMatch[];
  isFromTop3: boolean;
  isCustom: boolean;
}) {
  const isChanged = voiceSelection && !isFromTop3 && !isCustom;

  return (
    <div className="rounded-lg bg-[var(--color-panel-bg)] p-2.5 space-y-1.5">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">Voice</div>

      {/* Default: empty */}
      <div className="flex items-center gap-2 text-sm">
        <OriginDot origin="default" />
        <span className="text-[var(--color-text-muted)]">Default:</span>
        <span className="italic text-[var(--color-text-muted)]">none</span>
      </div>

      {/* AI: top 3 matches + custom created */}
      <div className="flex items-start gap-2 text-sm">
        <OriginDot origin="analyzed" className="mt-0.5" />
        <div>
          <span className="text-[var(--color-text-muted)]">AI:</span>
          {voiceMatches && voiceMatches.length > 0 ? (
            <span className="ml-1">
              {voiceMatches.slice(0, 3).map((m, i) => (
                <span key={m.voice_id}>
                  {i > 0 && <span className="text-[var(--color-text-muted)]">, </span>}
                  <span className={m.voice_id === voiceSelection?.voiceId ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"}>
                    {m.name}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="ml-1 italic text-[var(--color-text-muted)]">no matches</span>
          )}
          {isCustom && voiceSelection && (
            <>
              <span className="text-[var(--color-text-muted)]">, </span>
              <span className="font-medium text-[var(--color-text)]">{voiceSelection.voiceName}</span>
              <span className="ml-1 rounded-full bg-[var(--color-origin-analyzed)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-origin-analyzed)]">created</span>
            </>
          )}
        </div>
      </div>

      {/* User: selected voice */}
      <div className="flex items-center gap-2 text-sm">
        <OriginDot origin={isChanged ? "user" : "analyzed"} />
        <span className="text-[var(--color-text-muted)]">Selected:</span>
        {voiceSelection ? (
          <span className={isChanged ? "font-medium text-[var(--color-origin-user)]" : "text-[var(--color-text-secondary)]"}>
            {voiceSelection.voiceName}
            {isFromTop3 && <span className="ml-1 text-xs text-[var(--color-text-muted)]">(from top 3)</span>}
            {isCustom && <span className="ml-1 text-xs text-[var(--color-text-muted)]">(AI created)</span>}
            {isChanged && <span className="ml-1 text-xs text-[var(--color-origin-user)]">(manual pick)</span>}
          </span>
        ) : (
          <span className="italic text-[var(--color-text-muted)]">none</span>
        )}
      </div>
    </div>
  );
}

function OriginDot({ origin, className }: { origin: "default" | "analyzed" | "user"; className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className ?? ""}`}
      style={{ backgroundColor: `var(--color-origin-${origin})` }}
    />
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
