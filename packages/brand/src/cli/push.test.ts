import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import type { CommandRunner } from "./gcloud.ts";
import { DEPLOY_DISPATCH, PUSH_NEXT, push } from "./push.ts";

const BUCKET = "jci-oriente-brand-assets";
const profile: LoadedProfile = {
  ...loadProfile({ repoRoot: REPO_ROOT, profile: "jci-oriente" }),
  source: "env",
};

let from: string;
let calls: string[][];
const run: CommandRunner = async (command, args) => {
  calls.push([command, ...args]);
  return "";
};

beforeEach(() => {
  from = mkdtempSync(join(tmpdir(), "brand-push-"));
  writeAssetSet(from);
  calls = [];
});

afterEach(() => {
  rmSync(from, { recursive: true, force: true });
});

describe("push", () => {
  it("uploads every contract file with cp, one call per directory", async () => {
    await push({ profile, from, run });
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
    await push({ profile, from, run });
    const argv = calls.flat().join(" ");
    expect(argv).not.toMatch(/rsync|delete-unmatched/);
    expect(argv).not.toContain("pull-manifest.json");
  });

  it("refuses an invalid set before uploading anything", async () => {
    rmSync(join(from, "og-image.png"));
    await expect(push({ profile, from, run })).rejects.toThrow(/og-image\.png: missing/);
    expect(calls).toEqual([]);
  });

  it("says which folder to fix when the set is invalid", async () => {
    rmSync(join(from, "og-image.png"));
    const error = await push({ profile, from, run }).catch((caught: unknown) => caught);
    expect(error instanceof BrandConfigError ? error.remedies : []).toEqual([
      expect.objectContaining({ run: `BRAND_ASSETS_DIR=${from} pnpm brand:check` }),
    ]);
  });

  it("names the deploy dispatch and doctor as the next steps", () => {
    expect(PUSH_NEXT.map(({ run }) => run)).toEqual([
      "gh workflow run deploy.yml -f surface=all",
      DEPLOY_DISPATCH,
      "pnpm brand:doctor",
    ]);
  });

  it("refuses the default profile: the bucket must be named on purpose", async () => {
    const error = await push({ profile: { ...profile, source: "default" }, from, run }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(String(error)).toMatch(/BRAND_PROFILE/);
    expect(calls).toEqual([]);
  });

  it("refuses the fixture profile, which can never reach production", async () => {
    const fixture: LoadedProfile = {
      ...loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" }),
      source: "env",
    };
    await expect(push({ profile: fixture, from, run })).rejects.toThrow(/neutral test profile/);
    expect(calls).toEqual([]);
  });

  it("leaves the deploy dispatch to the owner, without running it", async () => {
    await push({ profile, from, run });
    expect(DEPLOY_DISPATCH).toBe("gh workflow run deploy.yml -f surface=hosting");
    expect(calls.some(([command]) => command === "gh")).toBe(false);
  });
});
