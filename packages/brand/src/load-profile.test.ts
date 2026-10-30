import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, loadProfile } from "./load-profile.ts";
import { brandErrorOf, errorsOf, exampleRepo, exampleToml } from "./test-profiles.ts";

let root: string;

/** A profile folder whose brand.toml is the example's, changed by `mutate`. */
function writeProfile(folder: string, mutate: (brand: Record<string, unknown>) => void = () => {}) {
  const brand = exampleToml();
  mutate(brand);
  mkdirSync(join(root, "brand", folder), { recursive: true });
  writeFileSync(join(root, "brand", folder, "brand.toml"), stringify(brand));
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
  const { remedies, message } = brandErrorOf(run);
  return { remedies, message };
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
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: EXAMPLE_PROFILE,
      source: "example",
    });
  });

  it("does not count a folder without brand.toml as a profile", () => {
    mkdirSync(join(root, "brand", "notes"));
    expect(loadProfile({ repoRoot: root, env: {} }).slug).toBe("other");
  });

  it("finds a chapter profile with no example beside it, and names the base it needs", () => {
    rmSync(join(root, "brand", EXAMPLE_PROFILE), { recursive: true });
    const { remedies, message } = remediesOf(() => loadProfile({ repoRoot: root, env: {} }));
    expect(message).toContain(
      "brand/example/brand.toml: missing; every chapter's brand.toml builds on it",
    );
    expect(remedies).toEqual([
      {
        change: "restore the example from git",
        run: "git checkout -- brand/example/brand.toml",
      },
    ]);
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
        change: "rename brand/Other_Name/ to lowercase letters, digits and hyphens",
      },
    ]);
  });

  it("lets the BRAND_PROFILE override win, and says so when it differs from brand/", () => {
    const profile = loadProfile({ repoRoot: root, env: { BRAND_PROFILE: EXAMPLE_PROFILE } });
    expect(profile.slug).toBe(EXAMPLE_PROFILE);
    expect(profile.source).toBe("override");
    expect(profile.warnings).toEqual([
      'BRAND_PROFILE=example in your environment overrides the profile found in brand/ ("other"). If you did not mean that: unset BRAND_PROFILE   # in your shell',
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

  it("selects brand/local/ over a committed chapter, and reads its images there", () => {
    writeProfile("local");
    const profile = loadProfile({ repoRoot: root, env: {} });
    expect(profile).toMatchObject({ slug: "local", source: "local", warnings: [] });
    expect(profile.dir).toBe(join(root, "brand", "local"));
    expect(profile.assetsDir).toBe(join(root, "brand", "local"));
  });

  it("leaves the committed chapter selected while brand/local/ holds no brand.toml", () => {
    mkdirSync(join(root, "brand", "local"));
    writeFileSync(join(root, "brand", "local", "notes.txt"), "images only, as CD pulls them");
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: "other",
      source: "chapter",
    });
  });

  it("reads a committed chapter's own assets/ until brand/local/ records bucket images", () => {
    expect(loadProfile({ repoRoot: root, env: {} }).assetsDir).toBe(
      join(root, "brand", "other", "assets"),
    );
    const local = join(root, "brand", "local");
    mkdirSync(local);
    const manifest = (source: "bucket" | "example") =>
      JSON.stringify({
        version: 1,
        project: "demo-example",
        bucket: "demo-example-brand-assets",
        objects: {
          "logo-main.png": {
            sha256: "a".repeat(64),
            source,
            ...(source === "bucket" ? { generation: "1" } : {}),
          },
        },
      });
    writeFileSync(join(local, ".pull-manifest.json"), manifest("example"));
    expect(loadProfile({ repoRoot: root, env: {} }).assetsDir).toBe(
      join(root, "brand", "other", "assets"),
    );
    writeFileSync(join(local, ".pull-manifest.json"), manifest("bucket"));
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: "other",
      assetsDir: local,
    });
  });

  it("reads the example's images from its own assets/", () => {
    expect(loadProfile({ repoRoot: root, profile: EXAMPLE_PROFILE }).assetsDir).toBe(
      join(root, "brand", EXAMPLE_PROFILE, "assets"),
    );
  });

  it("stops on a malformed manifest instead of guessing where the images are", () => {
    mkdirSync(join(root, "brand", "local"));
    writeFileSync(join(root, "brand", "local", ".pull-manifest.json"), "{");
    expect(errorsOf(() => loadProfile({ repoRoot: root, env: {} }))).toEqual([
      expect.stringMatching(/^brand\/local\/\.pull-manifest\.json: not valid JSON/),
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
    expect(errors).toEqual([expect.stringMatching(/"nope".*available: example, other/)]);
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

  it("names the profile, line and column when brand.toml is not valid TOML", () => {
    mkdirSync(join(root, "brand", "garbled"));
    writeFileSync(join(root, "brand", "garbled", "brand.toml"), 'name = "JCI"\ncity = { nope\n');
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "garbled" }));
    expect(errors).toEqual([
      expect.stringMatching(/^brand\/garbled\/brand\.toml: line 2, column \d+: /),
    ]);
  });

  it("reports an unreadable brand.toml as a profile error, not a crash", () => {
    mkdirSync(join(root, "brand", "dir", "brand.toml"), { recursive: true });
    const errors = errorsOf(() => loadProfile({ repoRoot: root, profile: "dir" }));
    expect(errors).toEqual([expect.stringMatching(/^brand\/dir\/brand\.toml: cannot read/)]);
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
      { change: "name one of: example, other" },
      { change: "or create your chapter's brand", run: "pnpm brand:init" },
    ]);
    expect(message).toContain("To fix:");
    expect(message).toContain("pnpm brand:init   # in the repo root");
    // Chosen with the override, the fix is there.
    expect(
      remediesOf(() => loadProfile({ repoRoot: root, env: { BRAND_PROFILE: "nope" } })).remedies[0],
    ).toEqual({
      change:
        "set BRAND_PROFILE to one of: example, other, or unset it to use the profile found in brand/",
    });
  });

  it("points a schema error at the file, the schema, the example and brand:check", () => {
    writeProfile("broken", (brand) => (brand.qrPrefix = "bad:prefix"));
    const { remedies } = remediesOf(() => loadProfile({ repoRoot: root, profile: "broken" }));
    expect(remedies).toEqual([
      {
        change:
          "edit the keys above in brand/broken/brand.toml (brand/brand.schema.json describes each; brand/example/brand.toml shows every one)",
        run: "pnpm brand:check",
      },
    ]);
  });

  it("asks to fix the TOML syntax of an unparsable file", () => {
    mkdirSync(join(root, "brand", "garbled"));
    writeFileSync(join(root, "brand", "garbled", "brand.toml"), "{ nope");
    const { remedies } = remediesOf(() => loadProfile({ repoRoot: root, profile: "garbled" }));
    expect(remedies).toEqual([
      { change: "fix the TOML syntax in brand/garbled/brand.toml at that line" },
    ]);
  });
});

describe("committed profiles", () => {
  it("the example parses", () => {
    expect(loadProfile({ profile: EXAMPLE_PROFILE }).brand.slug).toBe(EXAMPLE_PROFILE);
  });

  it("the example sets every key a chapter may leave out", () => {
    const own = exampleToml();
    for (const key of [
      "shortName",
      "legalName",
      "movementName",
      "description",
      "foundedYear",
      "broadcastChannelName",
      "locale",
      "ogLocale",
      "locality",
      "parentOrganization",
      "seo",
      "backstage",
      "og",
      "hero",
      "stats",
      "timeline",
      "mvv",
      "reasons",
      "contact",
      "linktree",
    ]) {
      expect(own).toHaveProperty(key);
    }
  });

  it("selects the example in a repository that holds only what upstream ships", () => {
    const upstream = exampleRepo();
    try {
      expect(loadProfile({ repoRoot: upstream, env: {} })).toMatchObject({
        source: "example",
        localOnly: true,
        brand: { name: "JCI Ejemplo" },
      });
    } finally {
      rmSync(upstream, { recursive: true, force: true });
    }
  });
});
