import { describe, it, expect } from "vitest";
import { parseAnalysisResponse } from "../src/engine/analyze-story";

describe("parseAnalysisResponse", () => {
  it("parses valid JSON", () => {
    const json = JSON.stringify({
      characters: [
        { name: "Narrator", description: "Narrator", voiceTraits: ["warm"] },
      ],
      segments: [
        {
          id: "seg-1",
          speaker: "Narrator",
          originalText: "Hello",
          voiceText: "Hello",
          inflection: "warm",
          emotion: "neutral",
        },
      ],
    });
    const result = parseAnalysisResponse(json);
    expect(result.characters).toHaveLength(1);
    expect(result.segments).toHaveLength(1);
  });

  it("strips markdown code fences", () => {
    const json = '```json\n{"characters":[],"segments":[]}\n```';
    const result = parseAnalysisResponse(json);
    expect(result.characters).toHaveLength(0);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAnalysisResponse("not json")).toThrow();
  });
});
