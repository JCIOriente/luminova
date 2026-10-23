import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT, OG_IMAGE_WARN_BYTES } from "../assets.ts";
import { REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { checkBrand, type CheckRow } from "./check.ts";

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
  profile = { ...loadProfile({ repoRoot: root, profile: "jci-oriente" }), source: "env" };
  writeAssetSet(join(root, PULLED_ASSETS_DIR));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkBrand", () => {
  it("prints one passing row per contract file, plus site content", async () => {
    const { rows, assetsDir } = await checkBrand({ profile, repoRoot: root, env: {} });
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
    const { rows } = await checkBrand({ profile, repoRoot: root, env: {} });
    expect(rows.filter(({ failed }) => failed).map(({ item }) => item)).toEqual([
      "og-image.png",
      "spotlight/favicon-32.png",
    ]);
    expect(rowFor(rows, "og-image.png").found).toBe("missing");
    expect(rowFor(rows, "spotlight/favicon-32.png").verdict).toMatch(/16×16, expected 32×32/);
  });

  it("warns on a heavy OG image without failing", async () => {
    const og = join(root, PULLED_ASSETS_DIR, "og-image.png");
    writeFileSync(og, Buffer.concat([readFileSync(og), Buffer.alloc(OG_IMAGE_WARN_BYTES + 1)]));
    const row = rowFor(
      (await checkBrand({ profile, repoRoot: root, env: {} })).rows,
      "og-image.png",
    );
    expect(row.failed).toBe(false);
    expect(row.verdict).toMatch(/^warn: .*WhatsApp/);
  });

  it("checks the asset directory the build would use", async () => {
    const other = mkdtempSync(join(tmpdir(), "brand-check-other-"));
    try {
      const { assetsDir, rows } = await checkBrand({
        profile,
        repoRoot: root,
        env: { BRAND_ASSETS_DIR: other },
      });
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
      (await checkBrand({ profile, repoRoot: root, env: {} })).rows,
      "site-content.json",
    );
    expect(row.failed).toBe(true);
    expect(row.verdict).toMatch(/stats/);
  });

  it("fails a missing site-content.json with the copy hint", async () => {
    rmSync(join(root, "brand/jci-oriente/site-content.json"));
    const row = rowFor(
      (await checkBrand({ profile, repoRoot: root, env: {} })).rows,
      "site-content.json",
    );
    expect(row.failed).toBe(true);
    expect(row.verdict).toMatch(/copy it from brand\/jci-oriente/);
  });

  describe("--release", () => {
    it("adds a failing row per release rule the profile breaks", async () => {
      const { rows } = await checkBrand({
        profile: { ...profile, source: "default" },
        repoRoot: root,
        env: { BRAND_ASSETS_DIR: "elsewhere" },
        release: true,
      });
      const release = rows.filter(({ item }) => item === "release");
      expect(release.every(({ failed }) => failed)).toBe(true);
      const verdicts = release.map(({ verdict }) => verdict).join("\n");
      expect(verdicts).toMatch(/BRAND_PROFILE is required/);
      expect(verdicts).toMatch(/BRAND_ASSETS_DIR is not allowed/);
      expect(verdicts).toMatch(/pull-manifest\.json: missing/);
    });

    it("reads brand-assets/ even when BRAND_ASSETS_DIR is set", async () => {
      const { assetsDir } = await checkBrand({
        profile,
        repoRoot: root,
        env: { BRAND_ASSETS_DIR: "elsewhere" },
        release: true,
      });
      expect(assetsDir).toBe(join(root, PULLED_ASSETS_DIR));
    });

    it("passes a pulled set for the selected profile", async () => {
      writeFileSync(
        join(root, PULLED_ASSETS_DIR, "pull-manifest.json"),
        JSON.stringify({ profile: "jci-oriente" }),
      );
      const { rows } = await checkBrand({ profile, repoRoot: root, env: {}, release: true });
      expect(rows.filter(({ failed }) => failed)).toEqual([]);
    });

    it("fails a set pulled for another profile", async () => {
      writeFileSync(
        join(root, PULLED_ASSETS_DIR, "pull-manifest.json"),
        JSON.stringify({ profile: "fixture" }),
      );
      const { rows } = await checkBrand({ profile, repoRoot: root, env: {}, release: true });
      const row = rowFor(rows, "pull-manifest.json");
      expect(row.failed).toBe(true);
      expect(row.verdict).toMatch(/re-run brand:pull/);
    });
  });
});
