import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandConfigError, DEFAULT_PROFILE, REPO_ROOT, loadProfile } from "./load-profile.ts";

let root: string;

function writeProfile(folder: string, mutate: (brand: Record<string, unknown>) => void = () => {}) {
  const brand = JSON.parse(readFileSync(join(REPO_ROOT, "brand/fixture/brand.json"), "utf8"));
  brand.slug = folder;
  mutate(brand);
  mkdirSync(join(root, "brand", folder), { recursive: true });
  writeFileSync(join(root, "brand", folder, "brand.json"), JSON.stringify(brand));
}

function errorsOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof BrandConfigError) return error.errors;
    throw error;
  }
  throw new Error("expected a BrandConfigError");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-load-"));
  writeProfile(DEFAULT_PROFILE);
  writeProfile("other");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("loadProfile", () => {
  it("defaults to jci-oriente with a one-line warning when BRAND_PROFILE is unset", () => {
    const profile = loadProfile({ repoRoot: root, env: {} });
    expect(profile.slug).toBe("jci-oriente");
    expect(profile.source).toBe("default");
    expect(profile.warnings).toEqual([expect.stringMatching(/BRAND_PROFILE is unset/)]);
  });

  it("prefers BRAND_PROFILE over the default", () => {
    const profile = loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "other" } });
    expect(profile.slug).toBe("other");
    expect(profile.source).toBe("env");
    expect(profile.warnings).toEqual([]);
    expect(profile.dir).toBe(join(root, "brand", "other"));
  });

  it("prefers an explicit profile over BRAND_PROFILE", () => {
    const profile = loadProfile({
      repoRoot: root,
      env: { BRAND_PROFILE: "other" },
      profile: DEFAULT_PROFILE,
    });
    expect(profile.slug).toBe(DEFAULT_PROFILE);
    expect(profile.source).toBe("argument");
  });

  it("fails when the slug differs from the folder name", () => {
    writeProfile("renamed", (brand) => (brand.slug = "original"));
    const errors = errorsOf(() =>
      loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "renamed" } }),
    );
    expect(errors).toEqual([
      expect.stringMatching(/slug "original" must equal its folder "renamed"/),
    ]);
  });

  it.each(["../other", "Other", "a/b", "-x"])(
    "rejects the malformed slug %j before touching the filesystem",
    (slug) => {
      const errors = errorsOf(() => loadProfile({ repoRoot: root, env: { BRAND_PROFILE: slug } }));
      expect(errors).toEqual([expect.stringMatching(/must be lowercase kebab-case/)]);
    },
  );

  it("lists the available profiles when the folder is missing", () => {
    const errors = errorsOf(() => loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "nope" } }));
    expect(errors).toEqual([expect.stringMatching(/"nope".*available: jci-oriente, other/)]);
  });

  it("reports every schema error with its field path at once", () => {
    writeProfile("broken", (brand) => {
      brand.qrPrefix = "bad:prefix";
      brand.foundedYear = 1800;
    });
    const errors = errorsOf(() =>
      loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "broken" } }),
    );
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toMatch(/broken.*qrPrefix/);
    expect(errors.join("\n")).toMatch(/broken.*foundedYear/);
  });

  it("names the profile when brand.json is not valid JSON", () => {
    mkdirSync(join(root, "brand", "garbled"));
    writeFileSync(join(root, "brand", "garbled", "brand.json"), "{ nope");
    const errors = errorsOf(() =>
      loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "garbled" } }),
    );
    expect(errors).toEqual([expect.stringMatching(/^brand\/garbled\/brand\.json: not valid JSON/)]);
  });

  it("reports an unreadable brand.json as a profile error, not a crash", () => {
    mkdirSync(join(root, "brand", "dir", "brand.json"), { recursive: true });
    const errors = errorsOf(() => loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "dir" } }));
    expect(errors).toEqual([expect.stringMatching(/^brand\/dir\/brand\.json: cannot read/)]);
  });

  it("aggregates the errors into the thrown message", () => {
    expect(() => loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "nope" } })).toThrow(
      /Brand profile error[\s\S]*available/,
    );
  });
});

describe("committed profiles", () => {
  it.each(["jci-oriente", "fixture"])("%s parses", (slug) => {
    const profile = loadProfile({ env: { BRAND_PROFILE: slug } });
    expect(profile.brand.slug).toBe(slug);
  });

  it("can load from a copy of the repo brand folder", () => {
    cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe("JCI Oriente");
  });
});
