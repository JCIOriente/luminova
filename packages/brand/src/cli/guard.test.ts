import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProfile } from "../load-profile.ts";
import {
  CHAPTER_REGEX,
  NEEDLE_EXCLUSIONS,
  assetHashes,
  collectNeedles,
  formatFinding,
  inverseChecks,
  scanDist,
} from "./guard.ts";

const chapter = loadProfile({ profile: "jci-oriente" });
const { brand } = chapter;

let dist: string;

function put(path: string, content: string | Uint8Array) {
  const file = join(dist, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), "brand-guard-test-"));
});

afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe("NEEDLE_EXCLUSIONS", () => {
  it("is pinned: widening it is a reviewed change", () => {
    expect(NEEDLE_EXCLUSIONS.map(({ keyPath }) => keyPath)).toEqual([
      "$schema",
      "themeColor.*",
      "locale",
      "ogLocale",
      "locality.country",
    ]);
    for (const { reason } of NEEDLE_EXCLUSIONS) expect(reason.length).toBeGreaterThan(10);
  });
});

describe("collectNeedles", () => {
  const needles = collectNeedles(brand, NEEDLE_EXCLUSIONS);
  const byValue = new Map(needles.map((needle) => [needle.value, needle.keyPaths]));

  it("takes every leaf string of 6+ characters with its key path", () => {
    expect(byValue.get(brand.firebase.web.messagingSenderId)).toContain(
      "firebase.web.messagingSenderId",
    );
    expect(byValue.get(brand.firebase.web.authDomain)).toEqual(["firebase.web.authDomain"]);
    expect(byValue.get(brand.urls.spotlight)).toEqual(["urls.spotlight"]);
    expect(byValue.get(brand.locality.city)).toEqual(["locality.city"]);
    expect(byValue.get(brand.og.legacyPaths[0] ?? "")).toEqual(["og.legacyPaths[0]"]);
  });

  it("merges key paths that share a value", () => {
    expect(brand.shortName).toBe(brand.name);
    expect(byValue.get(brand.name)).toEqual(["name", "shortName"]);
  });

  it("skips excluded keys, short strings, empty strings and non-strings", () => {
    const paths = needles.flatMap(({ keyPaths }) => keyPaths);
    expect(paths.some((path) => path.startsWith("themeColor"))).toBe(false);
    expect(paths).not.toContain("$schema");
    expect(paths).not.toContain("locale");
    expect(paths).not.toContain("ogLocale");
    expect(paths).not.toContain("locality.country");
    expect(paths).not.toContain("foundedYear");
    expect(paths).not.toContain("firebase.web.spotlight.vapidKey");
    expect(needles.every(({ value }) => value.length >= 6)).toBe(true);
    expect(collectNeedles({ a: "12345", b: "123456" }, [])).toEqual([
      { value: "123456", keyPaths: ["b"] },
    ]);
  });
});

describe("assetHashes", () => {
  it("hashes every file under the directory, recursively", () => {
    put("a.png", "one");
    put("nested/b.png", "two");
    const hashes = assetHashes(dist);
    const sha = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(hashes.get(sha("one"))).toBe("a.png");
    expect(hashes.get(sha("two"))).toBe("nested/b.png");
    expect(hashes.size).toBe(2);
  });
});

describe("scanDist", () => {
  const needles = collectNeedles(brand, NEEDLE_EXCLUSIONS);
  const scan = (hashes: Map<string, string> = new Map()) =>
    scanDist(dist, { needles, hashes, regex: CHAPTER_REGEX });

  it("passes a neutral dist", () => {
    put("index.html", "<title>Fixture Chapter</title>");
    put("assets/index-abc.js", 'const a="oriented layout";');
    const result = scan();
    expect(result.findings).toEqual([]);
    expect(result.filesScanned).toBe(2);
  });

  it("finds a needle and names the file and key path", () => {
    const sender = brand.firebase.web.messagingSenderId;
    put("assets/index-abc.js", `const s="${sender}";`);
    const { findings } = scan();
    expect(findings.map(formatFinding)).toContain(
      `assets/index-abc.js: ${sender} (firebase.web.messagingSenderId)`,
    );
  });

  it("finds an asset by hash, whatever its name", () => {
    const bytes = readFileSync(join(chapter.dir, "assets", "og-image.png"));
    put("og-image.12345678.png", bytes);
    const { findings } = scan(
      assetHashes(join(chapter.dir, "assets"), "brand/jci-oriente/assets/"),
    );
    expect(findings.map(formatFinding)).toEqual([
      "og-image.12345678.png: sha256 of brand/jci-oriente/assets/og-image.png (asset)",
    ]);
  });

  it("matches the regex case-sensitively and skips binary files", () => {
    put("a.js", "jci-Oriente");
    put("b.js", "in Santa Cruz");
    put("c.js", "Oriented but not oriente");
    put("e.bin", new Uint8Array([0, 74, 67, 73, 32, 79, 114, 105, 101, 110, 116, 101]));
    const rules = scan()
      .findings.filter(({ rule }) => rule.startsWith("regex"))
      .map(({ path, rule }) => `${path} ${rule}`);
    expect(rules).toEqual([
      `a.js regex ${CHAPTER_REGEX.source} matched "jci-Oriente"`,
      `b.js regex ${CHAPTER_REGEX.source} matched "Santa Cruz"`,
    ]);
  });
});

describe("inverseChecks", () => {
  const og = "og-image.0a1b2c3d.png";

  function writeSpotlightDist() {
    put(
      "index.html",
      `<link rel="canonical" href="${brand.urls.spotlight}/" /><meta property="og:image" content="${brand.urls.spotlight}/${og}" />`,
    );
    put(og, "png");
    for (const path of brand.og.legacyPaths) put(path, "png");
    put(
      "manifest.webmanifest",
      JSON.stringify({ name: brand.name, theme_color: brand.themeColor.spotlight }),
    );
    put("sitemap.xml", `<loc>${brand.urls.spotlight}/</loc>`);
    put("assets/index-abc.js", `const p="${brand.firebase.projectId}";`);
  }

  it("accepts a dist built from the profile", () => {
    writeSpotlightDist();
    expect(inverseChecks(dist, brand, "spotlight")).toEqual([]);
  });

  it("checks only manifest and bundle for backstage", () => {
    put(
      "manifest.webmanifest",
      JSON.stringify({ name: brand.name, theme_color: brand.themeColor.backstage }),
    );
    put("assets/index-abc.js", `const p="${brand.firebase.projectId}";`);
    expect(inverseChecks(dist, brand, "backstage")).toEqual([]);
  });

  it("reports a missing dist with the command that builds it", () => {
    const errors = inverseChecks(join(dist, "absent"), brand, "spotlight");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("pnpm turbo run build --filter spotlight --filter backstage");
  });

  it("reports each drifted value", () => {
    writeSpotlightDist();
    put("index.html", `<link rel="canonical" href="https://elsewhere.example/" />`);
    rmSync(join(dist, brand.og.legacyPaths[0] ?? ""));
    put("manifest.webmanifest", JSON.stringify({ name: "Other", theme_color: "#000000" }));
    put("sitemap.xml", "<loc>https://elsewhere.example/</loc>");
    put("assets/index-abc.js", `const p="${brand.firebase.storageBucket}";`);
    const errors = inverseChecks(dist, brand, "spotlight");
    expect(errors).toHaveLength(7);
    expect(errors.join("\n")).toContain(`canonical ${brand.urls.spotlight}/`);
    expect(errors.join("\n")).toContain(og);
    expect(errors.join("\n")).toContain(brand.og.legacyPaths[0]);
    expect(errors.join("\n")).toContain(`name "${brand.name}"`);
    expect(errors.join("\n")).toContain(brand.themeColor.spotlight);
    expect(errors.join("\n")).toContain("sitemap.xml");
    expect(errors.join("\n")).toContain(`projectId "${brand.firebase.projectId}"`);
  });
});
