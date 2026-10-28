import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import type { CommandRunner } from "./gcloud.ts";
import { DEPLOY_DISPATCH, ImagesNotReadyError, pushNext, push } from "./push.ts";

const BUCKET = "jci-oriente-brand-assets";
const profile: LoadedProfile = {
  ...loadProfile({ repoRoot: REPO_ROOT, profile: "jci-oriente" }),
  source: "example",
};

let root: string;
let from: string;
let calls: string[][];
const run: CommandRunner = async (command, args) => {
  calls.push([command, ...args]);
  return "";
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-push-"));
  from = join(root, PULLED_ASSETS_DIR);
  writeAssetSet(from);
  calls = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const upload = (options: { profile?: LoadedProfile } = {}) =>
  push({ profile, repoRoot: root, env: {}, run, ...options });

describe("push", () => {
  it("uploads every contract file with cp, one call per directory", async () => {
    await upload();
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.slice(0, 3)).toEqual(["gcloud", "storage", "cp"]);
    expect(calls.map((call) => call.at(-1))).toEqual([
      `gs://${BUCKET}/`,
      `gs://${BUCKET}/spotlight/`,
      `gs://${BUCKET}/backstage/`,
    ]);
    const uploaded = calls.flatMap((call) => call.slice(3, -1));
    expect(uploaded).toEqual(ASSET_CONTRACT.map(({ path }) => join(from, path)));
  });

  it("never syncs with deletion and never uploads the pull manifest", async () => {
    writeFileSync(join(from, "pull-manifest.json"), JSON.stringify({ profile: "jci-oriente" }));
    await upload();
    const argv = calls.flat().join(" ");
    expect(argv).not.toMatch(/rsync|delete-unmatched/);
    expect(argv).not.toContain("pull-manifest.json");
  });

  it("refuses an invalid set before uploading anything, with brand:check's images section", async () => {
    rmSync(join(from, "og-image.png"));
    const error = await upload().catch((caught: unknown) => caught);
    if (!(error instanceof ImagesNotReadyError)) throw new Error(`got ${String(error)}`);
    expect(error.images.title).toBe("Images in brand-assets/");
    expect(error.images.rows[0]).toMatchObject({
      check: "og-image.png",
      status: "fail",
      remedies: [expect.objectContaining({ run: "pnpm brand:check" })],
    });
    expect(calls).toEqual([]);
  });

  it("uploads the folder brand:check reads: the profile's own images while brand-assets/ is empty", async () => {
    rmSync(from, { recursive: true });
    mkdirSync(from);
    const images = await upload();
    expect(images.dir).toBe(join(REPO_ROOT, "brand/jci-oriente/assets"));
    expect(calls.flatMap((call) => call.slice(3, -1))).toEqual(
      ASSET_CONTRACT.map(({ path }) => join(images.dir, path)),
    );
  });

  it("checks first, then offers going live as a choice", () => {
    const next = pushNext("jci-oriente");
    expect(next.map(({ run }) => run)).toEqual([
      "pnpm brand:check",
      "gh workflow run deploy.yml -f surface=all",
      DEPLOY_DISPATCH,
    ]);
    expect(next[1]?.change).toMatch(/^when you are ready to go live/);
  });

  it("refuses the default profile: the bucket must be named on purpose", async () => {
    const error = await upload({ profile: { ...profile, source: "override" } }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(String(error)).toMatch(/BRAND_PROFILE/);
    expect(calls).toEqual([]);
  });

  it("refuses the fixture profile, which can never reach production", async () => {
    const fixture: LoadedProfile = {
      ...loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" }),
      source: "example",
    };
    await expect(upload({ profile: fixture })).rejects.toThrow(/neutral test profile/);
    expect(calls).toEqual([]);
  });

  it("leaves the deploy dispatch to the owner, without running it", async () => {
    await upload();
    expect(DEPLOY_DISPATCH).toBe("gh workflow run deploy.yml -f surface=hosting");
    expect(calls.some(([command]) => command === "gh")).toBe(false);
  });
});
