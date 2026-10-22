import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandConfigError, REPO_ROOT } from "./load-profile.ts";
import {
  SEEDED_SITE_CONTENT_KEYS,
  pickSeededSiteContent,
  readSiteContent,
} from "./site-content.ts";
import { parseSiteContent } from "./site-content-schema.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "brand-site-content-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function errorsOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof BrandConfigError) return error.errors;
    throw error;
  }
  throw new Error("expected a BrandConfigError");
}

describe("committed site-content.json", () => {
  it.each(["jci-oriente", "fixture"])("%s parses with the site-config schema", (slug) => {
    const raw = readSiteContent(join(REPO_ROOT, "brand", slug), slug);
    expect(() => parseSiteContent(raw, slug)).not.toThrow();
  });
});

describe("readSiteContent", () => {
  it("names the profile and file when it is missing", () => {
    expect(errorsOf(() => readSiteContent(dir, "acme"))).toEqual([
      expect.stringMatching(/^brand\/acme\/site-content\.json: missing/),
    ]);
  });

  it("reports invalid JSON", () => {
    writeFileSync(join(dir, "site-content.json"), "{ nope");
    expect(errorsOf(() => readSiteContent(dir, "acme"))).toEqual([
      expect.stringMatching(/^brand\/acme\/site-content\.json: not valid JSON/),
    ]);
  });
});

describe("parseSiteContent", () => {
  it("lists every schema problem by path", () => {
    const raw = readSiteContent(join(REPO_ROOT, "brand", "fixture"), "fixture");
    const broken = { ...Object(raw), stats: undefined, contact: { email: 1 } };
    const errors = errorsOf(() => parseSiteContent(broken, "fixture"));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^brand\/fixture\/site-content\.json stats:/),
        expect.stringMatching(/^brand\/fixture\/site-content\.json contact\.email:/),
      ]),
    );
  });

  it("does not accept the version or updatedAt the seeds stamp", () => {
    const raw = readSiteContent(join(REPO_ROOT, "brand", "fixture"), "fixture");
    const parsed = parseSiteContent({ ...Object(raw), version: 9 }, "fixture");
    expect(parsed).not.toHaveProperty("version");
  });
});

describe("pickSeededSiteContent", () => {
  it("keeps only the keys the seeds own, so hero and linktree edits survive a re-seed", () => {
    const raw = readSiteContent(join(REPO_ROOT, "brand", "jci-oriente"), "jci-oriente");
    expect(Object.keys(pickSeededSiteContent(raw)).sort()).toEqual(
      [...SEEDED_SITE_CONTENT_KEYS].sort(),
    );
  });
});
