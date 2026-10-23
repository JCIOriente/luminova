import { describe, expect, it } from "vitest";
import { normalizeSiteUrl, resolveUrls } from "./urls.ts";

const PRODUCTION = { spotlight: "https://example.org/", backstage: "https://admin.example.org" };

describe("normalizeSiteUrl", () => {
  it("strips a trailing slash", () => {
    expect(normalizeSiteUrl("https://jcioriente.org/")).toBe("https://jcioriente.org");
  });

  it.each(["http://jcioriente.org", "https://jcioriente.org/es", "https://jcioriente.org/?a=1"])(
    "rejects %s",
    (bad) => {
      expect(() => normalizeSiteUrl(bad)).toThrow(/bare https origin/);
    },
  );
});

describe("resolveUrls", () => {
  it("uses the dev ports under vite serve, whatever the emulator flag", () => {
    for (const emulatorEnabled of [true, false]) {
      expect(resolveUrls(PRODUCTION, { command: "serve", emulatorEnabled })).toEqual({
        spotlight: "http://localhost:5173",
        backstage: "http://localhost:5174",
      });
    }
  });

  it("uses the preview ports for an emulator build", () => {
    expect(resolveUrls(PRODUCTION, { command: "build", emulatorEnabled: true })).toEqual({
      spotlight: "http://localhost:4173",
      backstage: "http://localhost:4174",
    });
  });

  it("uses the normalized production origins otherwise", () => {
    expect(resolveUrls(PRODUCTION, { command: "build", emulatorEnabled: false })).toEqual({
      spotlight: "https://example.org",
      backstage: "https://admin.example.org",
    });
  });
});
