import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ICON_FILES, ICON_MASTER_FILE, validateAssets } from "../assets.ts";
import { writeAssetSet } from "../asset-set.ts";
import { BrandConfigError, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { encodePng } from "../png.ts";
import { BRAND_APPS } from "../ports.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { generateIcons } from "./icons.ts";

let root: string;
let assetsDir: string;
let profile: LoadedProfile;

/** A transparent square with an opaque red disc, like a logo mark exported on no background. */
async function writeMaster(size = 512): Promise<void> {
  const disc = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 3}" fill="#ff0000"/></svg>`,
  );
  mkdirSync(assetsDir, { recursive: true });
  await sharp(disc).png().toFile(join(assetsDir, ICON_MASTER_FILE));
}

async function pixel(path: string, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return [...data.subarray(offset, offset + 4)];
}

const rgba = (hex: string) => [
  ...[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)),
  255,
];

async function refusal(promise: Promise<unknown>): Promise<BrandConfigError> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof BrandConfigError))
    throw new Error(`expected a BrandConfigError, got ${String(error)}`);
  return error;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-icons-"));
  cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
  profile = loadProfile({ repoRoot: root, profile: "jci-oriente" });
  assetsDir = join(root, PULLED_ASSETS_DIR);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("generateIcons", () => {
  it("writes both apps' icons, and with the hand-made images the set passes the build's validator", async () => {
    await writeMaster();
    const written = await generateIcons({ profile, repoRoot: root });
    expect(written).toEqual(
      BRAND_APPS.flatMap((app) =>
        ICON_FILES.map(({ name }) => `${PULLED_ASSETS_DIR}/${app}/${name}`),
      ),
    );

    const handMade = join(root, "hand-made");
    writeAssetSet(handMade);
    for (const app of BRAND_APPS) {
      cpSync(join(assetsDir, app), join(handMade, app), { recursive: true });
    }
    expect(validateAssets(handMade).errors).toEqual([]);
  });

  it("puts the maskable and apple icons on an opaque themeColor background, and keeps the rest transparent", async () => {
    await writeMaster();
    await generateIcons({ profile, repoRoot: root });
    for (const app of BRAND_APPS) {
      const theme = rgba(profile.brand.themeColor[app]);
      for (const name of ["maskable-icon-512x512.png", "apple-touch-icon-180x180.png"]) {
        expect(await pixel(join(assetsDir, app, name), 0, 0)).toEqual(theme);
      }
      for (const name of ["pwa-512x512.png", "favicon-32.png"]) {
        expect((await pixel(join(assetsDir, app, name), 0, 0))[3]).toBe(0);
      }
      expect(await pixel(join(assetsDir, app, "pwa-512x512.png"), 256, 256)).toEqual([
        255, 0, 0, 255,
      ]);
    }
  });

  it("shrinks the master into the maskable safe zone and the apple padding", async () => {
    await writeMaster();
    await generateIcons({ profile, repoRoot: root });
    const theme = rgba(profile.brand.themeColor.spotlight);
    const red = [255, 0, 0, 255];
    // The disc spans a third of the master each side of centre; at full fill it reaches x = 85.
    const maskable = join(assetsDir, "spotlight", "maskable-icon-512x512.png");
    expect(await pixel(maskable, 100, 256)).toEqual(theme);
    expect(await pixel(maskable, 256, 256)).toEqual(red);
    const apple = join(assetsDir, "spotlight", "apple-touch-icon-180x180.png");
    expect(await pixel(apple, 35, 90)).toEqual(theme);
    expect(await pixel(apple, 90, 90)).toEqual(red);
  });

  it("refuses without a master, pointing at the guide step", async () => {
    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain(`${PULLED_ASSETS_DIR}/${ICON_MASTER_FILE}: missing`);
    expect(error.message).toContain("docs/adopting.md step 3");
    expect(existsSync(join(assetsDir, "spotlight"))).toBe(false);
  });

  it.each([
    ["too small", () => encodePng(256, 256, [0, 0, 0]), "256×256 is too small"],
    ["not square", () => encodePng(1024, 512, [0, 0, 0]), "1024×512 is not square"],
    ["not a PNG", () => Buffer.from("<svg/>"), "not a PNG"],
    [
      "truncated after a valid header",
      () => encodePng(512, 512, [0, 0, 0]).subarray(0, 60),
      "not a readable PNG",
    ],
  ])("refuses a master that is %s", async (_case, bytes, message) => {
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, ICON_MASTER_FILE), bytes());
    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain(message);
    expect(error.remedies.length).toBeGreaterThan(0);
    expect(existsSync(join(assetsDir, "spotlight"))).toBe(false);
  });

  it("refuses a master that is a folder", async () => {
    mkdirSync(join(assetsDir, ICON_MASTER_FILE), { recursive: true });
    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain(`${ICON_MASTER_FILE}: not a file`);
  });

  it("never overwrites an existing icon without --force, and writes nothing then", async () => {
    await writeMaster();
    const kept = join(assetsDir, "backstage", "favicon-16.png");
    mkdirSync(join(assetsDir, "backstage"), { recursive: true });
    writeFileSync(kept, "mine");

    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain(`${PULLED_ASSETS_DIR}/backstage/favicon-16.png`);
    expect(error.remedies.map(({ run }) => run)).toContain("pnpm brand:icons --force");
    expect(readFileSync(kept, "utf8")).toBe("mine");
    expect(existsSync(join(assetsDir, "spotlight", "favicon-16.png"))).toBe(false);

    await generateIcons({ profile, repoRoot: root, force: true });
    expect(readFileSync(kept).subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
