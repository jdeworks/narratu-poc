import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../src/App";

afterEach(cleanup);

describe("App", () => {
  it("renders the heading", () => {
    render(<App />);
    expect(screen.getByText("Turn your story into an audiobook")).toBeDefined();
  });

  it("renders the story input textarea", () => {
    render(<App />);
    expect(
      screen.getByPlaceholderText(/paste your short story/i),
    ).toBeDefined();
  });

  it("renders the submit button disabled when empty", () => {
    render(<App />);
    const button = screen.getByText("Create Audiobook");
    expect(button).toBeDefined();
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
