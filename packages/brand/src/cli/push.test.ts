import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  loadProfile,
  type LoadedProfile,
} from "../load-profile.ts";
import { chapterRepo, localRepo, recordLocal } from "../test-profiles.ts";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { DEPLOY_DISPATCH, ImagesNotReadyError, PUSH_NEXT, push } from "./push.ts";

const BUCKET = "jci-valle-brand-assets";
const CONTRACT = ["brand.toml", ...ASSET_CONTRACT.map(({ path }) => path)];

let root: string;
let profile: LoadedProfile;
let calls: string[][];
let conflicts: string[];

const local = (path = "") => join(root, "brand", "local", path);
const manifest = () => JSON.parse(readFileSync(local(".pull-manifest.json"), "utf8"));

/** Uploads succeed unless their object is in `conflicts`; the listing names new generations. */
const run: CommandRunner = async (command, args) => {
  calls.push([command, ...args]);
  if (args[1] === "objects") {
    return JSON.stringify(
      CONTRACT.map((name, index) => ({ name, generation: String(2000 + index) })),
    );
  }
  const target = args.at(-1) ?? "";
  if (conflicts.some((path) => target === `gs://${BUCKET}/${path}`)) {
    throw new CommandError(
      `gcloud storage cp failed: HTTPError 412: At least one of the pre-conditions you specified did not hold.`,
      [],
      "precondition",
    );
  }
  return "";
};

const uploads = () => calls.filter((call) => call[2] === "cp");

beforeEach(() => {
  root = localRepo("brand-push-");
  profile = loadProfile({ repoRoot: root, env: {} });
  calls = [];
  conflicts = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const upload = (options: { profile?: LoadedProfile } = {}) =>
  push({ profile, repoRoot: root, run, ...options });

describe("push", () => {
  it("uploads brand.toml and the 16 images, each create-only while never pushed", async () => {
    recordLocal(root, { source: "example" });
    await upload();
    expect(uploads()).toEqual(
      CONTRACT.map((path) => [
        "gcloud",
        "storage",
        "cp",
        "--if-generation-match=0",
        local(path),
        `gs://${BUCKET}/${path}`,
      ]),
    );
  });

  it("makes each upload conditional on the generation the manifest recorded", async () => {
    recordLocal(root);
    await upload();
    expect(uploads().map((call) => call[3])).toEqual(
      CONTRACT.map((_, index) => `--if-generation-match=${1000 + index}`),
    );
  });

  it("uploads create-only when the manifest records another bucket", async () => {
    recordLocal(root, { project: "jci-other" });
    await upload();
    expect(new Set(uploads().map((call) => call[3]))).toEqual(new Set(["--if-generation-match=0"]));
  });

  it("rewrites the manifest with the new generations and source bucket", async () => {
    recordLocal(root, { source: "example" });
    await upload();
    const written = manifest();
    expect(written).toMatchObject({ version: 1, project: "jci-valle", bucket: BUCKET });
    expect(Object.keys(written.objects)).toEqual(CONTRACT);
    expect(written.objects["og-image.png"]).toEqual({
      generation: "2004",
      md5: expect.stringMatching(/==$/),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      source: "bucket",
    });
  });

  it("says to pull first when another member uploaded since, recording only what went up", async () => {
    recordLocal(root);
    conflicts = ["og-image.png"];
    const before = manifest().objects["og-image.png"];
    const error = await upload().catch((caught: unknown) => caught);
    if (!(error instanceof BrandConfigError)) throw new Error(`got ${String(error)}`);
    expect(error.errors).toEqual([
      `gs://${BUCKET}/og-image.png: changed in the bucket since your last pull or push (another upload), so it was not replaced`,
    ]);
    expect(error.remedies).toEqual([
      expect.objectContaining({ run: "pnpm brand:pull" }),
      expect.objectContaining({ run: "pnpm brand:push" }),
    ]);
    expect(manifest().objects["og-image.png"]).toEqual(before);
    expect(manifest().objects["logo-main.png"].generation).toBe("2001");
  });

  it("never uploads the manifest or a file outside the contract", async () => {
    recordLocal(root);
    writeFileSync(local("icon-master.svg"), "<svg/>");
    await upload();
    const argv = calls.flat().join(" ");
    expect(argv).not.toMatch(/rsync|delete-unmatched|\.pull-manifest|icon-master/);
  });

  it("refuses an invalid set before uploading anything, with brand:check's images section", async () => {
    rmSync(local("og-image.png"));
    const error = await upload().catch((caught: unknown) => caught);
    if (!(error instanceof ImagesNotReadyError)) throw new Error(`got ${String(error)}`);
    expect(error.images.title).toBe("Images in brand/local/");
    expect(error.images.rows[0]).toMatchObject({
      check: "og-image.png",
      status: "fail",
      remedies: [expect.objectContaining({ run: "pnpm brand:check" })],
    });
    expect(calls).toEqual([]);
  });

  it("refuses a committed chapter: the bucket mirrors brand/local/", async () => {
    const committed = chapterRepo("brand-push-chapter-");
    try {
      const chapter = loadProfile({ repoRoot: committed, env: {} });
      const error = await push({ profile: chapter, repoRoot: committed, run }).catch(
        (caught: unknown) => caught,
      );
      expect(String(error)).toMatch(
        /brand:push uploads brand\/local\/[\s\S]*cp brand\/jci-valle\/brand\.toml brand\/local\/brand\.toml/,
      );
      expect(calls).toEqual([]);
    } finally {
      rmSync(committed, { recursive: true, force: true });
    }
  });

  it("refuses the default profile: the bucket must be named on purpose", async () => {
    const error = await upload({ profile: { ...profile, source: "override" } }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(String(error)).toMatch(/BRAND_PROFILE/);
    expect(calls).toEqual([]);
  });

  it("refuses the example, which can never reach production", async () => {
    const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    await expect(upload({ profile: example })).rejects.toThrow(/is the example/);
    expect(calls).toEqual([]);
  });

  it("leaves the deploy dispatch to the owner, without running it", async () => {
    await upload();
    expect(PUSH_NEXT).toEqual([
      {
        change: "deploy the sites with this brand from your fork (CD does not notice the bucket)",
        run: "gh workflow run deploy.yml -f surface=hosting",
        where: "shell",
      },
    ]);
    expect(DEPLOY_DISPATCH).toBe("gh workflow run deploy.yml -f surface=hosting");
    expect(calls.some(([command]) => command === "gh")).toBe(false);
  });
});
