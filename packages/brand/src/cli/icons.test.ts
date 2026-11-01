import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ICON_FILES, ICON_MASTER_FILE, ICON_MASTER_SVG_FILE, validateAssets } from "../assets.ts";
import { writeAssetSet } from "../asset-set.ts";
import { BrandConfigError, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { encodePng } from "../png.ts";
import { BRAND_APPS } from "../ports.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { TEST_CHAPTER, exampleRepo, writeChapter } from "../test-profiles.ts";
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

const yes = async () => true;
const no = async () => false;

async function refusal(promise: Promise<unknown>): Promise<BrandConfigError> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof BrandConfigError))
    throw new Error(`expected a BrandConfigError, got ${String(error)}`);
  return error;
}

beforeEach(() => {
  root = exampleRepo("brand-icons-");
  // Without the chapter's own images, brand-assets/ is the images folder, as in a chapter's fork.
  writeChapter(root, { assets: false });
  profile = loadProfile({ repoRoot: root, profile: TEST_CHAPTER });
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
    expect(error.errors.join()).toContain(
      `${PULLED_ASSETS_DIR}/${ICON_MASTER_FILE} or ${ICON_MASTER_SVG_FILE}: missing`,
    );
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

  describe("when icons are already there", () => {
    let kept: string;
    beforeEach(async () => {
      await writeMaster();
      kept = join(assetsDir, "backstage", "favicon-16.png");
      mkdirSync(join(assetsDir, "backstage"), { recursive: true });
      writeFileSync(kept, "mine");
    });

    it("asks before replacing them, naming how many and where", async () => {
      const questions: string[] = [];
      await generateIcons({
        profile,
        repoRoot: root,
        confirmReplace: async (question) => {
          questions.push(question);
          return true;
        },
      });
      expect(questions).toEqual([
        `Replace the 1 icon already in ${PULLED_ASSETS_DIR}/ with icons made from ${ICON_MASTER_FILE}?`,
      ]);
      expect(readFileSync(kept).subarray(1, 4).toString("latin1")).toBe("PNG");
    });

    it("writes nothing when the answer is no", async () => {
      expect(await generateIcons({ profile, repoRoot: root, confirmReplace: no })).toEqual([]);
      expect(readFileSync(kept, "utf8")).toBe("mine");
      expect(existsSync(join(assetsDir, "spotlight", "favicon-16.png"))).toBe(false);
    });

    it("refuses without a terminal to ask in, and writes nothing", async () => {
      const error = await refusal(generateIcons({ profile, repoRoot: root }));
      expect(error.errors.join()).toContain(`${PULLED_ASSETS_DIR}/backstage/favicon-16.png`);
      expect(error.remedies).toEqual([
        expect.objectContaining({
          change: expect.stringMatching(/in a terminal/),
          run: "pnpm brand:icons",
        }),
      ]);
      expect(readFileSync(kept, "utf8")).toBe("mine");
    });

    it("never asks while the master has a problem", async () => {
      rmSync(join(assetsDir, ICON_MASTER_FILE));
      const error = await refusal(
        generateIcons({
          profile,
          repoRoot: root,
          confirmReplace: async () => {
            throw new Error("asked");
          },
        }),
      );
      expect(error.errors.join()).toMatch(/missing/);
    });
  });
});

describe("generateIcons in the images folder brand:check names", () => {
  it("reads the master from, and writes the icons to, the profile's own assets/ while brand-assets/ holds no image", async () => {
    assetsDir = join(root, "brand", TEST_CHAPTER, "assets");
    writeAssetSet(assetsDir);
    await writeMaster();
    const written = await generateIcons({ profile, repoRoot: root, env: {}, confirmReplace: yes });
    expect(written).toContain("brand/jci-valle/assets/spotlight/pwa-512x512.png");
    expect(await pixel(join(assetsDir, "spotlight", "pwa-512x512.png"), 256, 256)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(existsSync(join(root, PULLED_ASSETS_DIR))).toBe(false);
  });
});

describe("generateIcons from an SVG master", () => {
  const svg = (width: number, height: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#ff0000"/></svg>`;

  function writeSvg(text: string): void {
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, ICON_MASTER_SVG_FILE), text);
  }

  it("renders a small square SVG sharp at every size, and the set passes the validator", async () => {
    writeSvg(svg(24, 24));
    const written = await generateIcons({ profile, repoRoot: root });
    expect(written).toHaveLength(ICON_FILES.length * BRAND_APPS.length);
    const icon = join(assetsDir, "spotlight", "pwa-512x512.png");
    expect(await pixel(icon, 256, 256)).toEqual([255, 0, 0, 255]);
    // The disc's edge stays crisp: a 24 px raster scaled up 20 times would blur it.
    expect((await pixel(icon, 256 - 150, 256))[3]).toBe(255);
    expect((await pixel(icon, 256 - 158, 256))[3]).toBe(0);
  });

  it("renders an SVG whose declared size is past sharp's default pixel limit", async () => {
    writeSvg(svg(20_000, 20_000));
    await generateIcons({ profile, repoRoot: root });
    const icon = join(assetsDir, "spotlight", "pwa-512x512.png");
    expect(await pixel(icon, 256, 256)).toEqual([255, 0, 0, 255]);
  });

  it.each([
    ["not square", svg(300, 200), "300×200 is not square"],
    ["not an SVG", "<svg", "not a readable SVG"],
  ])("refuses an SVG master that is %s", async (_case, text, message) => {
    writeSvg(text);
    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain(`${ICON_MASTER_SVG_FILE}: ${message}`);
    expect(existsSync(join(assetsDir, "spotlight"))).toBe(false);
  });

  it("refuses when both masters are there, naming both", async () => {
    await writeMaster();
    writeSvg(svg(512, 512));
    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain(ICON_MASTER_FILE);
    expect(error.errors.join()).toContain(ICON_MASTER_SVG_FILE);
    expect(error.remedies[0]?.change).toMatch(/keep one/);
  });
});

describe("generateIcons when the disk fails", () => {
  const files = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

  it("changes no icon when a write fails partway, and leaves no temporary file", async () => {
    await writeMaster();
    // backstage is written after spotlight; a file where its folder goes fails that write.
    writeFileSync(join(assetsDir, "backstage"), "not a folder");
    const error = await refusal(generateIcons({ profile, repoRoot: root }));
    expect(error.errors.join()).toContain("no icon changed");
    expect(files(join(assetsDir, "spotlight"))).toEqual([]);
  });

  it("names what was replaced when a rename fails after every write", async () => {
    await writeMaster();
    await generateIcons({ profile, repoRoot: root });
    // A non-empty folder where the last icon goes: its write succeeds, its rename cannot.
    const last = join(assetsDir, "backstage", "maskable-icon-512x512.png");
    rmSync(last);
    mkdirSync(join(last, "inside"), { recursive: true });

    const error = await refusal(generateIcons({ profile, repoRoot: root, confirmReplace: yes }));
    expect(error.errors.join()).toContain("11 of 12 icons replaced");
    expect(error.remedies.map(({ run }) => run)).toContain("pnpm brand:icons");
    for (const app of BRAND_APPS) {
      expect(files(join(assetsDir, app)).filter((name) => name.startsWith("."))).toEqual([]);
    }
  });
});
