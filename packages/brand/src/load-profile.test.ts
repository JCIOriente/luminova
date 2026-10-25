import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandConfigError, EXAMPLE_PROFILE, REPO_ROOT, loadProfile } from "./load-profile.ts";

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

const writeConfig = (text: string) => writeFileSync(join(root, "luminova.json"), text);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-load-"));
  writeProfile(EXAMPLE_PROFILE);
  writeProfile("other");
  writeConfig(JSON.stringify({ profile: "other" }));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function remediesOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof BrandConfigError)
      return { remedies: error.remedies, message: error.message };
    throw error;
  }
  throw new Error("expected a BrandConfigError");
}

describe("loadProfile", () => {
  it("reads the profile luminova.json names, with no warning", () => {
    const profile = loadProfile({ repoRoot: root, env: {} });
    expect(profile.slug).toBe("other");
    expect(profile.source).toBe("file");
    expect(profile.warnings).toEqual([]);
    expect(profile.dir).toBe(join(root, "brand", "other"));
  });

  it("lets the BRAND_PROFILE override win, and says so when it differs from the file", () => {
    const profile = loadProfile({ repoRoot: root, env: { BRAND_PROFILE: EXAMPLE_PROFILE } });
    expect(profile.slug).toBe(EXAMPLE_PROFILE);
    expect(profile.source).toBe("override");
    expect(profile.warnings).toEqual([
      'BRAND_PROFILE=jci-oriente in your environment overrides luminova.json ("other"). If you did not mean that: unset BRAND_PROFILE   # in your shell',
    ]);
    // Repeating the file's choice is no override: no warning, and release builds accept it.
    expect(loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "other" } })).toMatchObject({
      source: "file",
      warnings: [],
    });
  });

  it("prefers --profile over the override and the file", () => {
    const profile = loadProfile({
      repoRoot: root,
      env: { BRAND_PROFILE: "other" },
      profile: EXAMPLE_PROFILE,
    });
    expect(profile.slug).toBe(EXAMPLE_PROFILE);
    expect(profile.source).toBe("flag");
  });

  it("stops with both ways out when luminova.json is missing", () => {
    rmSync(join(root, "luminova.json"));
    const { remedies, message } = remediesOf(() => loadProfile({ repoRoot: root, env: {} }));
    expect(message).toMatch(/luminova\.json is missing/);
    expect(remedies.map(({ run, change }) => run ?? change)).toEqual([
      "pnpm brand:init",
      'or create luminova.json at the repo root for an existing profile: { "profile": "<slug>" }',
    ]);
  });

  it.each([
    ["{ nope", /luminova\.json: not valid JSON/],
    ['{ "profiel": "other" }', /luminova\.json \(root\): unknown field "profiel" \(a typo\?\)/],
    ["{}", /^luminova\.json profile: missing$/],
    ['{ "profile": "Other" }', /luminova\.json profile: must be lowercase kebab-case/],
  ])("rejects the luminova.json %s", (text, expected) => {
    writeConfig(text);
    expect(errorsOf(() => loadProfile({ repoRoot: root, env: {} })).join("\n")).toMatch(expected);
  });

  it("fails when the slug differs from the folder name", () => {
    writeProfile("renamed", (brand) => (brand.slug = "original"));
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "renamed" }));
    expect(errors).toEqual([
      expect.stringMatching(/slug "original" must equal its folder "renamed"/),
    ]);
  });

  it.each(["../other", "Other", "a/b", "-x"])(
    "rejects the malformed slug %j before touching the filesystem",
    (slug) => {
      const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: slug }));
      expect(errors).toEqual([expect.stringMatching(/must be lowercase kebab-case/)]);
    },
  );

  it("lists the available profiles when the folder is missing", () => {
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "nope" }));
    expect(errors).toEqual([expect.stringMatching(/"nope".*available: jci-oriente, other/)]);
  });

  it("reports every schema error with its field path at once", () => {
    writeProfile("broken", (brand) => {
      brand.qrPrefix = "bad:prefix";
      brand.foundedYear = 1800;
    });
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "broken" }));
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toMatch(/broken.*qrPrefix/);
    expect(errors.join("\n")).toMatch(/broken.*foundedYear/);
  });

  it("names the profile when brand.json is not valid JSON", () => {
    mkdirSync(join(root, "brand", "garbled"));
    writeFileSync(join(root, "brand", "garbled", "brand.json"), "{ nope");
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "garbled" }));
    expect(errors).toEqual([expect.stringMatching(/^brand\/garbled\/brand\.json: not valid JSON/)]);
  });

  it("reports an unreadable brand.json as a profile error, not a crash", () => {
    mkdirSync(join(root, "brand", "dir", "brand.json"), { recursive: true });
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "dir" }));
    expect(errors).toEqual([expect.stringMatching(/^brand\/dir\/brand\.json: cannot read/)]);
  });

  it("aggregates the errors into the thrown message", () => {
    expect(() => loadProfile({ repoRoot: root, profile: "nope" })).toThrow(
      /Brand profile error[\s\S]*available/,
    );
  });
});

describe("loadProfile remedies", () => {
  it("offers the available profiles and brand:init for a missing profile", () => {
    const { remedies, message } = remediesOf(() =>
      loadProfile({ repoRoot: root, profile: "nope" }),
    );
    expect(remedies).toEqual([
      { change: "pass --profile one of: jci-oriente, other" },
      { change: "or create brand/nope/", run: "pnpm brand:init" },
    ]);
    expect(message).toContain("To fix:");
    expect(message).toContain("pnpm brand:init   # in the repo root");
    // Chosen in luminova.json, the fix is there.
    writeConfig(JSON.stringify({ profile: "nope" }));
    expect(remediesOf(() => loadProfile({ repoRoot: root, env: {} })).remedies[0]).toEqual({
      change: 'set "profile" in luminova.json to one of: jci-oriente, other',
    });
  });

  it("points a schema error at the file, the schema and brand:check", () => {
    writeProfile("broken", (brand) => (brand.qrPrefix = "bad:prefix"));
    const { remedies } = remediesOf(() => loadProfile({ repoRoot: root, profile: "broken" }));
    expect(remedies).toEqual([
      {
        change:
          "edit the fields above in brand/broken/brand.json (brand/brand.schema.json describes each)",
        run: "pnpm brand:check",
      },
    ]);
  });

  it("names the field to change when the slug differs from its folder", () => {
    writeProfile("renamed", (brand) => (brand.slug = "original"));
    const { remedies } = remediesOf(() => loadProfile({ repoRoot: root, profile: "renamed" }));
    expect(remedies).toEqual([
      { change: 'set "slug" to "renamed" in brand/renamed/brand.json, or rename the folder' },
    ]);
  });

  it("asks to fix the JSON syntax of an unparsable file", () => {
    mkdirSync(join(root, "brand", "garbled"));
    writeFileSync(join(root, "brand", "garbled", "brand.json"), "{ nope");
    const { remedies } = remediesOf(() => loadProfile({ repoRoot: root, profile: "garbled" }));
    expect(remedies).toEqual([{ change: "fix the JSON syntax in brand/garbled/brand.json" }]);
  });
});

describe("committed profiles", () => {
  it.each(["jci-oriente", "fixture"])("%s parses", (slug) => {
    const profile = loadProfile({ profile: slug });
    expect(profile.brand.slug).toBe(slug);
  });

  it("can load from a copy of the repo brand folder", () => {
    cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
    cpSync(join(REPO_ROOT, "luminova.json"), join(root, "luminova.json"));
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe("JCI Oriente");
  });
});
