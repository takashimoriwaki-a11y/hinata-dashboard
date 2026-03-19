import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("GEMINI_API_KEY", () => {
  it("should be configured", () => {
    expect(ENV.geminiApiKey).toBeTruthy();
    expect(ENV.geminiApiKey.length).toBeGreaterThan(10);
  });

  it("should start with AIzaSy", () => {
    expect(ENV.geminiApiKey).toMatch(/^AIzaSy/);
  });
});
