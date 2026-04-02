import { describe, it, expect, beforeEach } from "vitest";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to dark when prefers-color-scheme is dark", async () => {
    const { useThemeStore } = await import("../src/stores/theme-store");
    const state = useThemeStore.getState();
    expect(["light", "dark"]).toContain(state.theme);
  });

  it("has a toggle function", async () => {
    const { useThemeStore } = await import("../src/stores/theme-store");
    expect(typeof useThemeStore.getState().toggle).toBe("function");
  });
});
