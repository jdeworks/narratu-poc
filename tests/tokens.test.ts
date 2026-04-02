import { describe, it, expect } from "vitest";
import { estimateTokens, MAX_TOKENS } from "../src/utils/tokens";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates tokens from character count", () => {
    const text = "a".repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it("rounds up partial tokens", () => {
    expect(estimateTokens("hi")).toBe(1);
  });
});

describe("MAX_TOKENS", () => {
  it("is 5000", () => {
    expect(MAX_TOKENS).toBe(5000);
  });
});
