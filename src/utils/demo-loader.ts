import { demoAssetUrl, type DemoManifest } from "../types/demo";
import { useVoiceAssignmentStore } from "../stores/voice-assignment-store";

export type SampleMap = Record<string, { mp3: string; v2?: string }>;
export type NameMap = Record<string, { voiceName: string; characterName: string; provider?: string }>;

export function buildSampleMaps(m: DemoManifest): { sampleMap: SampleMap; nameMap: NameMap } {
  const sampleMap: SampleMap = {};
  const nameMap: NameMap = {};

  for (const vp of m.voiceProfiles) {
    sampleMap[vp.voiceId] = { mp3: demoAssetUrl(vp.sampleFile), v2: vp.sampleFileV2 ? demoAssetUrl(vp.sampleFileV2) : undefined };
    nameMap[vp.voiceId] = { voiceName: vp.voiceName, characterName: vp.characterName, provider: vp.provider };
  }

  if (m.voiceMatches) {
    for (const [charName, matches] of Object.entries(m.voiceMatches)) {
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const slug = charName.toLowerCase().replace(/['.]/g, "").replace(/\s+/g, "-");
        const sampleId = `el-${slug}-match-${i + 1}`;
        if (!sampleMap[match.voice_id]) {
          const vp = m.voiceProfiles.find((p: { voiceId: string }) => p.voiceId === sampleId);
          if (vp) {
            sampleMap[match.voice_id] = { mp3: demoAssetUrl(vp.sampleFile) };
            nameMap[match.voice_id] = { voiceName: match.name, characterName: charName, provider: "elevenlabs" };
          }
        }
      }
    }
  }

  return { sampleMap, nameMap };
}

export function loadDemoSelections(
  m: DemoManifest,
  sampleMap: SampleMap,
  nameMap: NameMap,
): void {
  if (!m.demoSelections) return;
  const assignStore = useVoiceAssignmentStore.getState();
  for (const [charName, sel] of Object.entries(m.demoSelections as Record<string, { voiceId: string; voiceName: string; source: string }>)) {
    assignStore.assign(charName, { voiceId: sel.voiceId, voiceName: sel.voiceName, source: sel.source as "preset" | "custom" });
    const slug = charName.toLowerCase().replace(/['.]/g, "").replace(/\s+/g, "-");
    const selectedFile = sel.source === "custom"
      ? `samples/el-${slug}-custom-selected.mp3`
      : `samples/el-${slug}-selected.mp3`;
    if (!sampleMap[sel.voiceId]) {
      sampleMap[sel.voiceId] = { mp3: demoAssetUrl(selectedFile) };
      nameMap[sel.voiceId] = { voiceName: sel.voiceName, characterName: charName, provider: "elevenlabs" };
    }
  }
}
