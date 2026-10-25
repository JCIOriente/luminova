import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT, OG_IMAGE_WARN_BYTES } from "../assets.ts";
import { REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { checkBrand, checkRemedies, checkRows, type BrandCheck, type CheckRow } from "./check.ts";

const withRows = (check: BrandCheck) => ({ ...check, rows: checkRows(check) });

let root: string;
let profile: LoadedProfile;

function rowFor(rows: CheckRow[], item: string): CheckRow {
  const row = rows.find((candidate) => candidate.item === item);
  if (!row) throw new Error(`no row for ${item}`);
  return row;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-check-"));
  cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
  profile = { ...loadProfile({ repoRoot: root, profile: "jci-oriente" }), source: "example" };
  writeAssetSet(join(root, PULLED_ASSETS_DIR));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkBrand", () => {
  it("prints one passing row per contract file, plus site content", async () => {
    const { rows, assetsDir } = withRows(await checkBrand({ profile, repoRoot: root, env: {} }));
    expect(assetsDir).toBe(join(root, PULLED_ASSETS_DIR));
    expect(rows.map(({ item }) => item)).toEqual([
      ...ASSET_CONTRACT.map(({ path }) => path),
      "site-content.json",
    ]);
    expect(rows.filter(({ failed }) => failed)).toEqual([]);
    expect(rowFor(rows, "og-image.png")).toEqual({
      item: "og-image.png",
      expected: "1200×630",
      found: "1200×630",
      verdict: "ok",
      failed: false,
    });
  });

  it("fails the rows of a missing and a mis-sized file, and only those", async () => {
    rmSync(join(root, PULLED_ASSETS_DIR, "og-image.png"));
    cpSync(
      join(root, PULLED_ASSETS_DIR, "spotlight/favicon-16.png"),
      join(root, PULLED_ASSETS_DIR, "spotlight/favicon-32.png"),
    );
    const { rows } = withRows(await checkBrand({ profile, repoRoot: root, env: {} }));
    expect(rows.filter(({ failed }) => failed).map(({ item }) => item)).toEqual([
      "og-image.png",
      "spotlight/favicon-32.png",
    ]);
    expect(rowFor(rows, "og-image.png")).toMatchObject({ found: "missing", verdict: "missing" });
    expect(rowFor(rows, "spotlight/favicon-32.png").verdict).toBe("wrong size");
  });

  it("warns on a heavy OG image without failing", async () => {
    const og = join(root, PULLED_ASSETS_DIR, "og-image.png");
    writeFileSync(og, Buffer.concat([readFileSync(og), Buffer.alloc(OG_IMAGE_WARN_BYTES + 1)]));
    const row = rowFor(
      withRows(await checkBrand({ profile, repoRoot: root, env: {} })).rows,
      "og-image.png",
    );
    expect(row.failed).toBe(false);
    expect(row.verdict).toMatch(/^warn: .*WhatsApp/);
  });

  it.each([
    ["--assets", (dir: string) => ({ env: {}, assets: dir })],
    [
      "the BRAND_ASSETS_DIR tooling override",
      (dir: string) => ({ env: { BRAND_ASSETS_DIR: dir } }),
    ],
  ])("checks the folder %s names", async (_, options) => {
    const other = mkdtempSync(join(tmpdir(), "brand-check-other-"));
    try {
      const { assetsDir, rows } = withRows(
        await checkBrand({ profile, repoRoot: root, ...options(other) }),
      );
      expect(assetsDir).toBe(other);
      expect(rows.filter(({ failed }) => failed)).toHaveLength(ASSET_CONTRACT.length);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("schema-validates the profile's site content", async () => {
    const file = join(root, "brand/jci-oriente/site-content.json");
    writeFileSync(file, JSON.stringify({ stats: "nope" }));
    const row = rowFor(
      withRows(await checkBrand({ profile, repoRoot: root, env: {} })).rows,
      "site-content.json",
    );
    expect(row.failed).toBe(true);
    expect(row.verdict).toMatch(/stats/);
  });

  it("fails a missing site-content.json with the copy hint", async () => {
    rmSync(join(root, "brand/jci-oriente/site-content.json"));
    const row = rowFor(
      withRows(await checkBrand({ profile, repoRoot: root, env: {} })).rows,
      "site-content.json",
    );
    expect(row.failed).toBe(true);
    expect(row.verdict).toMatch(/copy it from brand\/jci-oriente/);
  });

  describe("--release", () => {
    it("adds a failing row per release rule the profile breaks", async () => {
      const { rows } = withRows(
        await checkBrand({
          profile: { ...profile, source: "override" },
          repoRoot: root,
          env: { BRAND_ASSETS_DIR: "elsewhere" },
          release: true,
        }),
      );
      const release = rows.filter(({ item }) => item === "deploy");
      expect(release.every(({ failed }) => failed)).toBe(true);
      const verdicts = release.map(({ verdict }) => verdict).join("\n");
      expect(verdicts).toMatch(/is set in your environment/);
      expect(verdicts).toMatch(/BRAND_ASSETS_DIR is not allowed/);
      expect(verdicts).toMatch(/no pull-manifest\.json in brand-assets\//);
    });

    it("reads brand-assets/ even when BRAND_ASSETS_DIR is set", async () => {
      const { assetsDir } = withRows(
        await checkBrand({
          profile,
          repoRoot: root,
          env: { BRAND_ASSETS_DIR: "elsewhere" },
          release: true,
        }),
      );
      expect(assetsDir).toBe(join(root, PULLED_ASSETS_DIR));
    });

    it("passes a pulled set for the selected profile", async () => {
      writeFileSync(
        join(root, PULLED_ASSETS_DIR, "pull-manifest.json"),
        JSON.stringify({ profile: "jci-oriente" }),
      );
      const { rows } = withRows(
        await checkBrand({ profile, repoRoot: root, env: {}, release: true }),
      );
      expect(rows.filter(({ failed }) => failed)).toEqual([]);
    });

    it("fails a set pulled for another profile", async () => {
      writeFileSync(
        join(root, PULLED_ASSETS_DIR, "pull-manifest.json"),
        JSON.stringify({ profile: "fixture" }),
      );
      const { rows } = withRows(
        await checkBrand({ profile, repoRoot: root, env: {}, release: true }),
      );
      const row = rowFor(rows, "pull-manifest.json");
      expect(row.failed).toBe(true);
      expect(row.verdict).toMatch(/re-run brand:pull/);
    });
  });

  describe("remedies", () => {
    it("says what to do about each failing group, in table order", async () => {
      rmSync(join(root, PULLED_ASSETS_DIR, "og-image.png"));
      writeFileSync(
        join(root, "brand/jci-oriente/site-content.json"),
        JSON.stringify({ stats: "nope" }),
      );
      const check = await checkBrand({
        profile: { ...profile, source: "override" },
        repoRoot: root,
        env: {},
        release: true,
      });
      const changes = checkRemedies(check).map(({ change, run }) => change ?? run);
      // A deploy only uses pulled images: placing files by hand is never offered here.
      expect(changes[0]).toBe(
        "download the images a deploy uses from the profile's bucket (needs gcloud auth login)",
      );
      expect(changes[1]).toMatch(
        /^edit the fields above in brand\/jci-oriente\/site-content\.json/,
      );
      expect(changes.join("\n")).not.toMatch(/put the files marked above/);
    });

    it("has none for a passing check", async () => {
      expect(checkRemedies(await checkBrand({ profile, repoRoot: root, env: {} }))).toEqual([]);
    });
  });
});
