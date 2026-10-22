import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_LOGO_SIZE, writeAssetSet } from "./asset-set.ts";
import { ASSET_CONTRACT, OG_IMAGE_WARN_BYTES, validateAssets } from "./assets.ts";
import { REPO_ROOT } from "./load-profile.ts";
import { encodePng } from "./png.ts";

let dir: string;

describe("committed profile assets", () => {
  it("the jci-oriente set meets the contract with its 674×326 logos", () => {
    const result = validateAssets(join(REPO_ROOT, "brand/jci-oriente/assets"));
    expect(result.errors).toEqual([]);
    expect(result.logoSize).toEqual({ width: 674, height: 326 });
  });

  it("the fixture set meets the contract with 400×200 logos", () => {
    const result = validateAssets(join(REPO_ROOT, "brand/fixture/assets"));
    expect(result.errors).toEqual([]);
    expect(result.logoSize).toEqual(FIXTURE_LOGO_SIZE);
  });
});

function put(path: string, contents: Buffer) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), contents);
}

const writeCompleteSet = () => writeAssetSet(dir);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "brand-assets-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("ASSET_CONTRACT", () => {
  it("lists the sixteen required files", () => {
    expect(ASSET_CONTRACT).toHaveLength(16);
    expect(ASSET_CONTRACT.map((spec) => spec.path)).toContain(
      "backstage/maskable-icon-512x512.png",
    );
  });
});

describe("validateAssets", () => {
  it("accepts a complete set and reports the shared logo size", () => {
    writeCompleteSet();
    const result = validateAssets(dir);
    expect(result.errors).toEqual([]);
    expect(result.logoSize).toEqual({ width: 400, height: 200 });
  });

  it("reports every missing file with its expected size in one pass", () => {
    const result = validateAssets(dir);
    expect(result.errors).toHaveLength(16);
    expect(result.errors).toContainEqual(expect.stringMatching(/og-image\.png.*missing.*1200×630/));
    expect(result.errors).toContainEqual(
      expect.stringMatching(/spotlight\/favicon-16\.png.*missing.*16×16/),
    );
    expect(result.errors).toContainEqual(
      expect.stringMatching(/logo-main\.png.*missing.*height ≥ 184/),
    );
  });

  it("rejects wrong dimensions", () => {
    writeCompleteSet();
    put("spotlight/pwa-192x192.png", encodePng(190, 192, [0, 0, 0]));
    expect(validateAssets(dir).errors).toEqual([
      expect.stringMatching(/spotlight\/pwa-192x192\.png.*190×192.*expected 192×192/),
    ]);
  });

  it("rejects a file that is not a PNG", () => {
    writeCompleteSet();
    put("og-image.png", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/> padding padding"));
    expect(validateAssets(dir).errors).toEqual([expect.stringMatching(/og-image\.png.*not a PNG/)]);
  });

  it("rejects logos of unequal size", () => {
    writeCompleteSet();
    put("logo-on-dark.png", encodePng(402, 200, [0, 0, 0]));
    expect(validateAssets(dir).errors).toEqual([
      expect.stringMatching(/logo-on-dark\.png.*402×200.*same size as logo-main\.png \(400×200\)/),
    ]);
  });

  it("rejects logos shorter than 184 px", () => {
    writeCompleteSet();
    for (const logo of ["logo-main.png", "logo-on-dark.png", "logo-on-primary.png"]) {
      put(logo, encodePng(300, 100, [0, 0, 0]));
    }
    expect(validateAssets(dir).errors).toHaveLength(3);
  });

  it("warns, without failing, when the OG image is heavy", () => {
    writeCompleteSet();
    const og = encodePng(1200, 630, [0, 0, 0]);
    put("og-image.png", Buffer.concat([og, Buffer.alloc(OG_IMAGE_WARN_BYTES)]));
    const result = validateAssets(dir);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.stringMatching(/og-image\.png.*300 KB/)]);
  });

  it("rejects a pull manifest written for another profile", () => {
    writeCompleteSet();
    put("pull-manifest.json", Buffer.from(JSON.stringify({ profile: "other" })));
    expect(validateAssets(dir, { profile: "fixture" }).errors).toEqual([
      expect.stringMatching(/pull-manifest\.json.*"other".*"fixture"/),
    ]);
  });

  it("accepts a pull manifest for the selected profile", () => {
    writeCompleteSet();
    put("pull-manifest.json", Buffer.from(JSON.stringify({ profile: "fixture" })));
    expect(validateAssets(dir, { profile: "fixture" }).errors).toEqual([]);
  });
});
