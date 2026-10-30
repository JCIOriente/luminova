import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ICON_FILES, OG_IMAGE_FILE } from "./assets.ts";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile } from "./load-profile.ts";
import { encodePng } from "./png.ts";
import { stagePublic } from "./stage-public.ts";

const { brand } = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });

let root: string;
let assetsDir: string;
let appPublicDir: string;
let outDir: string;

function put(path: string, contents: Buffer | string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function stage(app: "spotlight" | "backstage", name = brand.name) {
  return stagePublic({ appPublicDir, assetsDir, app, brand: { ...brand, name }, outDir });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-stage-"));
  assetsDir = join(root, "assets");
  appPublicDir = join(root, "public");
  outDir = join(root, "out");
  for (const app of ["spotlight", "backstage"]) {
    for (const { name, size } of ICON_FILES) {
      put(
        join(assetsDir, app, name),
        encodePng(size, size, app === "spotlight" ? [1, 2, 3] : [4, 5, 6]),
      );
    }
  }
  put(join(assetsDir, OG_IMAGE_FILE), encodePng(1200, 630, [9, 9, 9]));
  put(join(appPublicDir, "robots.txt"), "User-agent: *\n");
  put(join(appPublicDir, "fonts", "inter.woff2"), "font");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("stagePublic", () => {
  it("copies the app's icon set to the root of the staged dir", () => {
    stage("backstage");
    for (const { name } of ICON_FILES) {
      expect(readFileSync(join(outDir, name))).toEqual(
        readFileSync(join(assetsDir, "backstage", name)),
      );
    }
  });

  it("copies the app's public files recursively", () => {
    stage("spotlight");
    expect(readFileSync(join(outDir, "robots.txt"), "utf8")).toBe("User-agent: *\n");
    expect(readFileSync(join(outDir, "fonts", "inter.woff2"), "utf8")).toBe("font");
  });

  it("treats a missing public dir as empty", () => {
    rmSync(appPublicDir, { recursive: true });
    stage("backstage");
    expect(existsSync(join(outDir, ICON_FILES[0].name))).toBe(true);
  });

  it("names the OG image by the hash of its bytes", () => {
    const first = stage("spotlight").ogImageFile;
    expect(first).toMatch(/^og-image\.[0-9a-f]{8}\.png$/);
    expect(stage("spotlight").ogImageFile).toBe(first);

    put(join(assetsDir, OG_IMAGE_FILE), encodePng(1200, 630, [8, 8, 8]));
    const second = stage("spotlight").ogImageFile;
    expect(second).not.toBe(first);
    expect(existsSync(join(outDir, second))).toBe(true);
    expect(existsSync(join(outDir, first))).toBe(false);
  });

  it("writes each legacy alias byte-identical to the hashed OG image", () => {
    const { ogImageFile } = stage("spotlight");
    const hashed = readFileSync(join(outDir, ogImageFile));
    expect(hashed).toEqual(readFileSync(join(assetsDir, OG_IMAGE_FILE)));
    expect(brand.og.legacyPaths.length).toBeGreaterThan(0);
    for (const legacy of brand.og.legacyPaths) {
      expect(readFileSync(join(outDir, legacy))).toEqual(hashed);
    }
  });

  it("gives backstage no OG files", () => {
    expect(stage("backstage").ogImageFile).toBe("");
    expect(existsSync(join(outDir, OG_IMAGE_FILE))).toBe(false);
    for (const legacy of brand.og.legacyPaths) {
      expect(existsSync(join(outDir, legacy))).toBe(false);
    }
  });

  it("substitutes the brand name into the messaging service worker as a safe JS string", () => {
    put(
      join(appPublicDir, "firebase-messaging-sw.js"),
      'const title = "__BRAND_NAME__";\nconst other = "__BRAND_NAME__";\n',
    );
    stage("backstage", 'Chapter "Quoted" \\ Ñandú');
    expect(readFileSync(join(outDir, "firebase-messaging-sw.js"), "utf8")).toBe(
      'const title = "Chapter \\"Quoted\\" \\\\ Ñandú";\nconst other = "Chapter \\"Quoted\\" \\\\ Ñandú";\n',
    );
  });

  it("removes stale files from a previous run", () => {
    stage("spotlight");
    put(join(outDir, "stale.txt"), "old");
    stage("backstage");
    expect(existsSync(join(outDir, "stale.txt"))).toBe(false);
    for (const legacy of brand.og.legacyPaths) {
      expect(existsSync(join(outDir, legacy))).toBe(false);
    }
  });
});
