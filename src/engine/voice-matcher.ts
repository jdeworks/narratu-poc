/**
 * Voice matching engine — scores ElevenLabs shared voices against character profiles.
 * Used for both auto-matching (top 3) and the preset browser (ranked list).
 */

import type { CharacterProfile } from "../stores/project-store";

const API_BASE = "http://localhost:4001";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SharedVoice {
  voice_id: string;
  name: string;
  gender: string;
  age: string;
  accent: string;
  language: string;
  locale: string;
  descriptive: string;
  use_case: string;
  category: string;
  description: string;
  preview_url: string;
  usage_character_count_1y: number;
  cloned_by_count: number;
  featured: boolean;
  verified_languages?: { language: string; model_id: string; accent: string; preview_url: string }[];
}

export interface ScoredVoice {
  voice: SharedVoice;
  score: number;
  reasons: string[];
}

// ── Mapping tables ─────────────────────────────────────────────────────────

const AGE_MAP: Record<string, string> = {
  child: "young",
  teen: "young",
  teenager: "young",
  young: "young",
  "young adult": "young",
  adult: "middle_aged",
  "middle-aged": "middle_aged",
  elderly: "old",
  old: "old",
  senior: "old",
};

const ACCENT_MAP: Record<string, string> = {
  british: "british",
  english: "british",
  american: "american",
  australian: "australian",
  irish: "irish",
  scottish: "scottish",
  indian: "indian",
  african: "african",
  french: "french",
  german: "german",
  italian: "italian",
  spanish: "spanish",
  japanese: "japanese",
  chinese: "chinese",
  korean: "korean",
  russian: "russian",
};

// ElevenLabs descriptive values that can be used as API filter
const VALID_DESCRIPTIVES = new Set([
  "calm", "casual", "classy", "confident", "crisp", "deep", "excited",
  "gentle", "husky", "hyped", "mature", "meditative", "pleasant",
  "professional", "raspy", "relaxed", "rough", "serious", "upbeat",
  "whispery", "wise",
]);

// Map character voice traits to closest ElevenLabs descriptive
const TRAIT_TO_DESCRIPTIVE: Record<string, string> = {
  warm: "pleasant",
  nervous: "casual",
  hearty: "upbeat",
  formal: "professional",
  composed: "calm",
  measured: "calm",
  controlled: "calm",
  mischievous: "casual",
  bright: "upbeat",
  cheerful: "upbeat",
  brisk: "crisp",
  dry: "serious",
  wry: "serious",
  tense: "serious",
  gentle: "gentle",
  deep: "deep",
  raspy: "raspy",
  rough: "rough",
  hoarse: "raspy",
  playful: "casual",
  relaxed: "relaxed",
  confident: "confident",
  whispery: "whispery",
  wise: "wise",
  mature: "mature",
  excited: "excited",
};

/**
 * Physical/identity traits describe the VOICE ITSELF — timbre, texture, pitch.
 * These are must-haves: a "hoarse" character needs a hoarse voice.
 * Missing a physical trait gets a heavy penalty.
 */
const PHYSICAL_TRAITS = new Set([
  "deep", "raspy", "hoarse", "husky", "rough", "whispery", "gravelly",
  "breathy", "nasal", "high-pitched", "low", "booming", "thin",
  "crisp", "smooth", "rich", "warm", "gentle", "soft",
]);

/**
 * Style/delivery traits describe HOW the voice speaks — these are nice-to-have
 * and can be achieved through direction/tags rather than voice selection.
 */
// Everything not in PHYSICAL_TRAITS is considered a style trait.

function isPhysicalTrait(trait: string): boolean {
  return PHYSICAL_TRAITS.has(trait.toLowerCase());
}

// ── API calls ──────────────────────────────────────────────────────────────

interface SearchParams {
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  search?: string;
  descriptives?: string;
  use_cases?: string;
  category?: string;
  page_size?: number;
  page?: number;
}

async function searchVoices(params: SearchParams): Promise<{ voices: SharedVoice[]; total_count: number }> {
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) query.set(key, String(val));
  }

  const res = await fetch(`${API_BASE}/api/elevenlabs/search-voices?${query.toString()}`);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Voice search failed: ${msg}`);
  }
  return res.json();
}

// ── Scoring ────────────────────────────────────────────────────────────────

function scoreVoice(voice: SharedVoice, character: CharacterProfile): ScoredVoice {
  let score = 0;
  const reasons: string[] = [];

  const charGender = character.gender?.toLowerCase();
  const charAge = character.age?.toLowerCase();
  const charOrigin = character.origin?.toLowerCase();
  const charDialect = character.dialect?.toLowerCase();
  const isNarrator = character.name.toLowerCase() === "narrator";

  // ── Gender match (critical) ──
  if (charGender && charGender !== "unknown") {
    if (voice.gender === charGender) {
      score += 15;
      reasons.push(`gender: ${charGender}`);
    } else if (!isNarrator) {
      score -= 30; // hard penalty for wrong gender on characters
    }
  }

  // ── Age match ──
  if (charAge && charAge !== "unknown") {
    const mappedAge = AGE_MAP[charAge];
    if (mappedAge && voice.age === mappedAge) {
      score += 10;
      reasons.push(`age: ${voice.age}`);
    } else if (mappedAge && voice.age) {
      // Distance penalty
      const tiers = ["young", "middle_aged", "old"];
      const charTier = tiers.indexOf(mappedAge);
      const voiceTier = tiers.indexOf(voice.age);
      if (charTier >= 0 && voiceTier >= 0) {
        const dist = Math.abs(charTier - voiceTier);
        if (dist === 1) score -= 3;
        else if (dist >= 2) score -= 10;
      }
    }
  }

  // ── Accent match ──
  if (charOrigin && charOrigin !== "unknown" && charOrigin !== "none") {
    const mappedAccent = ACCENT_MAP[charOrigin] ?? charOrigin;
    if (voice.accent === mappedAccent) {
      score += 8;
      reasons.push(`accent: ${voice.accent}`);
    } else if (voice.accent) {
      score -= 2;
    }
  }

  // ── Trait matching — physical traits are must-haves, style traits are bonuses ──
  const charTraits = (character.voiceTraits ?? []).map((t) => t.toLowerCase());
  const physicalTraits = charTraits.filter(isPhysicalTrait);
  const styleTraits = charTraits.filter((t) => !isPhysicalTrait(t));
  const desc = `${voice.name} ${voice.description}`.toLowerCase();

  // Physical traits: heavy reward for match, heavy penalty for miss
  for (const trait of physicalTraits) {
    const mapped = TRAIT_TO_DESCRIPTIVE[trait];
    const matchesDescriptive = voice.descriptive === trait || (mapped && voice.descriptive === mapped);
    const matchesText = desc.includes(trait) || (mapped && desc.includes(mapped));

    if (matchesDescriptive) {
      score += 12;
      reasons.push(`physical: ${trait}`);
    } else if (matchesText) {
      score += 8;
      reasons.push(`physical text: "${trait}"`);
    } else {
      // Penalty for missing a physical trait — this voice doesn't sound right
      score -= 8;
    }
  }

  // Style traits: bonus for match, no penalty for miss (can be achieved via direction)
  for (const trait of styleTraits) {
    const mapped = TRAIT_TO_DESCRIPTIVE[trait];
    if (voice.descriptive === trait || (mapped && voice.descriptive === mapped)) {
      score += 4;
      reasons.push(`style: ${trait}`);
    } else if (desc.includes(trait)) {
      score += 2;
      reasons.push(`style text: "${trait}"`);
    }
  }

  // Dialect in description
  if (charDialect && charDialect !== "unknown" && charDialect !== "none") {
    if (desc.includes(charDialect.toLowerCase())) {
      score += 5;
      reasons.push(`dialect: ${charDialect}`);
    }
  }

  // ── Use case bonus ──
  if (voice.use_case === "narrative_story") {
    score += 3;
    reasons.push("use: narrative");
  } else if (voice.use_case === "characters_animation") {
    score += 2;
  }

  // ── Quality signals ──
  if (voice.category === "professional") {
    score += 3;
    reasons.push("professional");
  } else if (voice.category === "high_quality") {
    score += 2;
    reasons.push("high quality");
  }

  // Popularity (logarithmic, capped at 3)
  if (voice.cloned_by_count > 0) {
    const pop = Math.min(3, Math.log10(voice.cloned_by_count) / 2);
    score += pop;
  }

  // Verified English
  if (voice.verified_languages?.some((v) => v.language === "en")) {
    score += 1;
  }

  // Penalize voices with clearly mismatched accent keywords in name/description
  if (charOrigin && charOrigin !== "unknown") {
    const wrongAccents = ["arabic", "indian", "african", "asian", "latin", "spanish", "french", "german", "italian", "russian", "chinese", "japanese", "korean"];
    const mappedAccent = ACCENT_MAP[charOrigin] ?? charOrigin;
    for (const wa of wrongAccents) {
      if (wa !== mappedAccent && desc.includes(wa)) {
        score -= 10;
        break;
      }
    }
  }

  // Narrator-specific: prefer "narrative_story" and "calm"/"professional"
  if (isNarrator) {
    if (/narrator|storytell|audiobook|narrat/i.test(desc)) {
      score += 5;
      reasons.push("narrator keyword");
    }
  }

  return { voice, score, reasons };
}

// ── Main matching function ─────────────────────────────────────────────────

export interface MatchResult {
  top: ScoredVoice[];
  all: ScoredVoice[];
  totalSearched: number;
}

/**
 * Find the best matching voices for a character.
 * Returns top 3 + full ranked list for the browser.
 */
export async function matchVoicesForCharacter(
  character: CharacterProfile,
  onProgress?: (msg: string) => void,
): Promise<MatchResult> {
  const charGender = character.gender?.toLowerCase();
  const charAge = character.age?.toLowerCase();
  const charOrigin = character.origin?.toLowerCase();
  const charTraits = (character.voiceTraits ?? []).map((t) => t.toLowerCase());

  // Build API params from character profile
  const params: SearchParams = {
    page_size: 100,
    use_cases: "narrative_story",
    category: "professional",
  };

  if (charGender && charGender !== "unknown") {
    params.gender = charGender;
  }
  if (charAge && charAge !== "unknown") {
    params.age = AGE_MAP[charAge];
  }
  if (charOrigin && charOrigin !== "unknown" && charOrigin !== "none") {
    params.accent = ACCENT_MAP[charOrigin] ?? charOrigin;
  }

  // Prioritize physical traits for the descriptive filter
  const physicalTraits = charTraits.filter(isPhysicalTrait);
  const allTraitsMapped = charTraits.map((t) => TRAIT_TO_DESCRIPTIVE[t]).filter((d) => d && VALID_DESCRIPTIVES.has(d));

  // Use the first physical trait as API filter, or fall back to any trait
  const primaryDescriptive = physicalTraits.map((t) => TRAIT_TO_DESCRIPTIVE[t]).find((d) => d && VALID_DESCRIPTIVES.has(d))
    ?? allTraitsMapped[0];
  if (primaryDescriptive) {
    params.descriptives = primaryDescriptive;
  }

  onProgress?.("Searching voices with filters...");

  // Primary search with all filters
  let result = await searchVoices(params);
  let allVoices = result.voices;

  // If too few results, relax filters progressively
  if (allVoices.length < 10) {
    onProgress?.("Relaxing filters for more options...");
    delete params.descriptives;
    result = await searchVoices(params);
    allVoices = result.voices;
  }

  if (allVoices.length < 10) {
    delete params.age;
    result = await searchVoices(params);
    allVoices = result.voices;
  }

  // If character has physical traits, also search specifically for them
  if (physicalTraits.length > 0) {
    onProgress?.("Searching for voice character...");
    for (const trait of physicalTraits) {
      const mapped = TRAIT_TO_DESCRIPTIVE[trait];
      if (mapped && VALID_DESCRIPTIVES.has(mapped)) {
        try {
          const traitResult = await searchVoices({
            ...params,
            descriptives: mapped,
            page_size: 50,
          });
          const existingIds = new Set(allVoices.map((v) => v.voice_id));
          for (const v of traitResult.voices) {
            if (!existingIds.has(v.voice_id)) {
              allVoices.push(v);
              existingIds.add(v.voice_id);
            }
          }
        } catch { /* continue */ }
      }
    }
  }

  // Also try a text search for trait keywords (second page of results)
  const traitSearch = charTraits.slice(0, 3).join(" ");
  if (traitSearch) {
    onProgress?.("Searching by traits...");
    try {
      const textResult = await searchVoices({
        gender: params.gender,
        language: "en",
        search: traitSearch,
        page_size: 50,
      });
      // Merge unique voices
      const existingIds = new Set(allVoices.map((v) => v.voice_id));
      for (const v of textResult.voices) {
        if (!existingIds.has(v.voice_id)) {
          allVoices.push(v);
          existingIds.add(v.voice_id);
        }
      }
    } catch {
      // Text search failed, continue with what we have
    }
  }

  onProgress?.(`Scoring ${allVoices.length} candidates...`);

  // Score all voices
  const scored = allVoices
    .map((v) => scoreVoice(v, character))
    .sort((a, b) => b.score - a.score);

  // Deduplicate by voice_id (text search may overlap)
  const seen = new Set<string>();
  const deduped = scored.filter((s) => {
    if (seen.has(s.voice.voice_id)) return false;
    seen.add(s.voice.voice_id);
    return true;
  });

  return {
    top: deduped.slice(0, 3),
    all: deduped,
    totalSearched: allVoices.length,
  };
}
