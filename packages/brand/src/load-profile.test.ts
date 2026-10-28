import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  NEUTRAL_PROFILE,
  REPO_ROOT,
  chapterProfiles,
  loadProfile,
} from "./load-profile.ts";

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
  writeProfile(EXAMPLE_PROFILE);
  writeProfile("other");
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
  it("selects the one chapter profile in brand/, with no warning", () => {
    const profile = loadProfile({ repoRoot: root, env: {} });
    expect(profile.slug).toBe("other");
    expect(profile.source).toBe("chapter");
    expect(profile.warnings).toEqual([]);
    expect(profile.dir).toBe(join(root, "brand", "other"));
  });

  it("selects the example when brand/ holds no chapter profile", () => {
    rmSync(join(root, "brand", "other"), { recursive: true });
    writeProfile(NEUTRAL_PROFILE);
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: EXAMPLE_PROFILE,
      source: "example",
    });
  });

  it("does not count a folder without brand.json as a profile", () => {
    mkdirSync(join(root, "brand", "notes"));
    expect(loadProfile({ repoRoot: root, env: {} }).slug).toBe("other");
  });

  it("finds a chapter profile with no example beside it", () => {
    rmSync(join(root, "brand", EXAMPLE_PROFILE), { recursive: true });
    expect(loadProfile({ repoRoot: root, env: {} }).slug).toBe("other");
  });

  it("never reads a leftover luminova.json", () => {
    writeFileSync(join(root, "luminova.json"), JSON.stringify({ profile: EXAMPLE_PROFILE }));
    expect(loadProfile({ repoRoot: root, env: {} }).slug).toBe("other");
  });

  it("stops on two chapter profiles, naming both and the way out", () => {
    writeProfile("jci-andina");
    const { remedies, message } = remediesOf(() => loadProfile({ repoRoot: root, env: {} }));
    expect(message).toContain(
      "brand/ holds 2 chapter profiles (jci-andina, other); a repository builds one.",
    );
    expect(remedies).toEqual([
      { change: "delete the folder under brand/ you do not build, so one chapter profile remains" },
    ]);
  });

  it("stops with brand:init when brand/ holds no profile at all", () => {
    rmSync(join(root, "brand"), { recursive: true });
    const { remedies, message } = remediesOf(() => loadProfile({ repoRoot: root, env: {} }));
    expect(message).toContain("brand/ holds no profile");
    expect(remedies).toEqual([{ change: "create your chapter's profile", run: "pnpm brand:init" }]);
  });

  it("asks to rename a discovered folder whose name is no slug", () => {
    writeProfile("Other_Name");
    rmSync(join(root, "brand", "other"), { recursive: true });
    const { remedies } = remediesOf(() => loadProfile({ repoRoot: root, env: {} }));
    expect(remedies).toEqual([
      {
        change:
          'rename brand/Other_Name/ to lowercase letters, digits and hyphens, and set "slug" in its brand.json to match',
      },
    ]);
  });

  it("lets the BRAND_PROFILE override win, and says so when it differs from brand/", () => {
    const profile = loadProfile({ repoRoot: root, env: { BRAND_PROFILE: EXAMPLE_PROFILE } });
    expect(profile.slug).toBe(EXAMPLE_PROFILE);
    expect(profile.source).toBe("override");
    expect(profile.warnings).toEqual([
      'BRAND_PROFILE=jci-oriente in your environment overrides the profile found in brand/ ("other"). If you did not mean that: unset BRAND_PROFILE   # in your shell',
    ]);
    // Repeating the discovered choice is no override: no warning, and release builds accept it.
    expect(loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "other" } })).toMatchObject({
      source: "chapter",
      warnings: [],
    });
  });

  it("still obeys the override when brand/ has no single choice", () => {
    writeProfile("jci-andina");
    const profile = loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "other" } });
    expect(profile).toMatchObject({ slug: "other", source: "override" });
    expect(profile.warnings).toEqual([
      "BRAND_PROFILE=other in your environment overrides the profile found in brand/. If you did not mean that: unset BRAND_PROFILE   # in your shell",
    ]);
  });

  it("prefers the profile its caller names over the override and brand/", () => {
    const profile = loadProfile({
      repoRoot: root,
      env: { BRAND_PROFILE: "other" },
      profile: EXAMPLE_PROFILE,
    });
    expect(profile.slug).toBe(EXAMPLE_PROFILE);
    expect(profile.source).toBe("named");
  });

  it("lists the chapter profiles for brand:init's one-per-repository rule", () => {
    writeProfile(NEUTRAL_PROFILE);
    expect(chapterProfiles(root)).toEqual(["other"]);
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
      { change: "name one of: jci-oriente, other" },
      { change: "or create brand/nope/", run: "pnpm brand:init" },
    ]);
    expect(message).toContain("To fix:");
    expect(message).toContain("pnpm brand:init   # in the repo root");
    // Chosen with the override, the fix is there.
    expect(
      remediesOf(() => loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "nope" } })).remedies[0],
    ).toEqual({
      change:
        "set BRAND_PROFILE to one of: jci-oriente, other, or unset it to use the profile found in brand/",
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
    rmSync(join(root, "brand"), { recursive: true });
    cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      source: "example",
      brand: { name: "JCI Oriente" },
    });
  });
});
