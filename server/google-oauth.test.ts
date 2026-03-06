import { describe, it, expect } from "vitest";

describe("Google OAuth environment variables", () => {
  it("GOOGLE_OAUTH_CLIENT_ID is set and valid", () => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(clientId).toBeTruthy();
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  it("GOOGLE_OAUTH_CLIENT_SECRET is set and valid", () => {
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(clientSecret).toBeTruthy();
    expect(clientSecret).toMatch(/^GOCSPX-/);
  });
});
