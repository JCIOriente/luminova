import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT, OG_IMAGE_WARN_BYTES } from "../assets.ts";
import { loadProfile, type LoadedProfile } from "../load-profile.ts";
import { chapterRepo, localRepo } from "../test-profiles.ts";
import { checkImages } from "./images.ts";

let root: string;
let profile: LoadedProfile;
const TOTAL = ASSET_CONTRACT.length;

const images = () => checkImages({ profile, repoRoot: root });
const brandAssets = () => join(root, "brand", "local");

beforeEach(() => {
  root = localRepo("brand-images-");
  profile = loadProfile({ repoRoot: root, env: {} });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkImages", () => {
  it("is one passing row when every image is right, under a title naming the folder", () => {
    const { title, rows, dir } = images();
    expect(dir).toBe(brandAssets());
    expect(title).toBe("Images in brand/local/");
    expect(rows).toEqual([{ check: "images", status: "ok", detail: `all ${TOTAL} valid` }]);
  });

  it("lists only the images with a problem, then counts the rest", () => {
    rmSync(join(brandAssets(), "og-image.png"));
    cpSync(
      join(brandAssets(), "spotlight/favicon-16.png"),
      join(brandAssets(), "spotlight/favicon-32.png"),
    );
    const { rows } = images();
    expect(rows.map(({ check, status, detail }) => [check, status, detail])).toEqual([
      ["og-image.png", "fail", "missing (expected 1200×630)"],
      ["spotlight/favicon-32.png", "fail", "16×16, expected 32×32"],
      ["images", "ok", `${TOTAL - 2} more valid`],
    ]);
  });

  it("drops the summary row when no image is right", () => {
    rmSync(brandAssets(), { recursive: true });
    mkdirSync(brandAssets());
    writeFileSync(join(brandAssets(), "og-image.png"), "not a png");
    const { rows } = images();
    expect(rows).toHaveLength(TOTAL);
    expect(rows.every(({ status }) => status === "fail")).toBe(true);
  });

  it("puts the fix for each kind of problem on the failing rows", () => {
    rmSync(join(brandAssets(), "og-image.png"));
    const [missing] = images().rows;
    expect(missing?.remedies).toEqual([
      expect.objectContaining({
        change: expect.stringMatching(/^put the files marked above in brand\/local\//),
        run: "pnpm brand:check",
      }),
    ]);
  });

  it("warns on a heavy OG image without failing", () => {
    const og = join(brandAssets(), "og-image.png");
    writeFileSync(og, Buffer.concat([readFileSync(og), Buffer.alloc(OG_IMAGE_WARN_BYTES + 1)]));
    const [heavy] = images().rows;
    expect(heavy).toMatchObject({ check: "og-image.png", status: "warn" });
    expect(heavy?.detail).toMatch(/WhatsApp/);
  });

  it("keeps files outside the contract out of the section: an icon master, notes", () => {
    writeFileSync(join(brandAssets(), "notes.txt"), "mine");
    expect(images().rows).toEqual([expect.objectContaining({ check: "images", status: "ok" })]);
  });

  it("reads a committed chapter's own assets/ while brand/local/ holds no pulled images", () => {
    const committed = chapterRepo("brand-images-chapter-");
    try {
      const chapter = loadProfile({ repoRoot: committed, env: {} });
      const { title, dir } = checkImages({ profile: chapter, repoRoot: committed });
      expect(dir).toBe(join(committed, "brand/jci-valle/assets"));
      expect(title).toBe("Images in brand/jci-valle/assets/");
    } finally {
      rmSync(committed, { recursive: true, force: true });
    }
  });
});
