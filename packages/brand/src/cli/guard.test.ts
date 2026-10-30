import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { loadProfile } from "../load-profile.ts";
import {
  chapterProfile,
  chapterRepo,
  exampleRepo,
  localRepo,
  recordLocal,
} from "../test-profiles.ts";
import { seedLocal } from "./seed.ts";
import {
  CHAPTER_REGEX,
  NEEDLE_EXCLUSIONS,
  assetHashes,
  imageHashes,
  collectNeedles,
  emittedLogoHashes,
  exampleOutcome,
  formatFinding,
  inverseChecks,
  scanDist,
} from "./guard.ts";

const chapter = chapterProfile();
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
      "themeColor.*",
      "locale",
      "ogLocale",
      "locality.country",
      "movementName",
      "parentOrganization.*",
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
    expect(paths).not.toContain("locale");
    expect(paths).not.toContain("ogLocale");
    expect(paths).not.toContain("locality.country");
    expect(paths).not.toContain("movementName");
    expect(paths.some((path) => path.startsWith("parentOrganization"))).toBe(false);
    expect(paths).not.toContain("foundedYear");
    expect(paths).not.toContain("firebase.web.spotlight.vapidKey");
    expect(needles.every(({ value }) => value.length >= 6)).toBe(true);
    expect(collectNeedles({ a: "12345", b: "123456" }, [])).toEqual([
      { value: "123456", keyPaths: ["b"] },
    ]);
  });

  it("skips a value the chapter shares with the example at the same key: a default it kept", () => {
    const example = {
      backstage: { emailPlaceholder: "tu.nombre@example.org" },
      name: "JCI Ejemplo",
    };
    const own = {
      backstage: { emailPlaceholder: "tu.nombre@example.org" },
      name: "JCI Valle",
      x: "JCI Ejemplo",
    };
    expect(collectNeedles(own, [], example)).toEqual([
      { value: "JCI Valle", keyPaths: ["name"] },
      { value: "JCI Ejemplo", keyPaths: ["x"] },
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

describe("imageHashes", () => {
  it("hashes only the 16 contract images, never brand.toml, the manifest or a note", () => {
    const root = localRepo("brand-guard-images-");
    try {
      recordLocal(root);
      const dir = join(root, "brand", "local");
      writeFileSync(join(dir, "README.txt"), "notes");
      writeFileSync(join(dir, "og-image.png"), "a distinct og image");
      const hashes = imageHashes(dir, "brand/local/");
      expect(hashes.get(createHash("sha256").update("a distinct og image").digest("hex"))).toBe(
        "brand/local/og-image.png",
      );
      const images = new Set(ASSET_CONTRACT.map(({ path }) => `brand/local/${path}`));
      expect([...hashes.values()].filter((label) => !images.has(label))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scanDist", () => {
  const needles = collectNeedles(brand, NEEDLE_EXCLUSIONS);
  const scan = (hashes: Map<string, string> = new Map()) =>
    scanDist(dist, { needles, hashes, regex: CHAPTER_REGEX });

  it("passes a neutral dist", () => {
    put("index.html", "<title>JCI Ejemplo</title>");
    put("assets/index-abc.js", 'const a="oriented layout";');
    const result = scan();
    expect(result.findings).toEqual([]);
    expect(result.filesScanned).toBe(2);
  });

  it("passes the movement-wide words every chapter shares (D10)", () => {
    put(
      "index.html",
      `<p>${brand.movementName}, ${brand.parentOrganization.name} ${brand.parentOrganization.url}, ${brand.locality.country}</p>`,
    );
    expect(scan().findings).toEqual([]);
  });

  it("finds a needle and names the file and key path", () => {
    const sender = brand.firebase.web.messagingSenderId;
    put("assets/index-abc.js", `const s="${sender}";`);
    const { findings } = scan();
    expect(findings.map(formatFinding)).toContain(
      `assets/index-abc.js: ${sender} (firebase.web.messagingSenderId)`,
    );
  });

  it("hashes the chapter build's emitted logos, which imagetools re-encodes", () => {
    put("assets/logo-main-a1b2.webp", "webp bytes");
    put("assets/index-abc.js", "js");
    const hashes = emittedLogoHashes(dist, "apps/spotlight/dist/");
    expect([...hashes.values()]).toEqual(["apps/spotlight/dist/assets/logo-main-a1b2.webp"]);
  });

  it("finds an asset by hash, whatever its name", () => {
    const bytes = readFileSync(join(chapter.dir, "assets", "og-image.png"));
    put("og-image.12345678.png", bytes);
    const { findings } = scan(assetHashes(join(chapter.dir, "assets"), "brand/jci-valle/assets/"));
    expect(findings.map(formatFinding)).toEqual([
      "og-image.12345678.png: sha256 of brand/jci-valle/assets/og-image.png (asset)",
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

describe("exampleOutcome", () => {
  const roots: string[] = [];
  const repo = (make: () => string) => {
    const root = make();
    roots.push(root);
    return root;
  };
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("protects a chapter profile", () => {
    const repoRoot = repo(chapterRepo);
    expect(exampleOutcome(loadProfile({ repoRoot, env: {} }), {})).toBeUndefined();
  });

  it("passes with a notice where brand/ holds no chapter profile (a fork)", () => {
    const repoRoot = repo(exampleRepo);
    const outcome = exampleOutcome(loadProfile({ repoRoot, env: {} }), {});
    expect(outcome?.code).toBe(0);
    expect(outcome?.message).toMatch(/no chapter profile to protect/);
  });

  it("passes with a notice while brand/local/ is still the seeded example", () => {
    const repoRoot = repo(exampleRepo);
    seedLocal({ repoRoot, env: {} });
    const outcome = exampleOutcome(loadProfile({ repoRoot, env: {} }), {}, repoRoot);
    expect(outcome).toEqual({
      code: 0,
      message:
        "brand:guard: brand/local/ is still the example install seeded, so it holds no chapter to protect; nothing to check.",
    });
  });

  it("protects brand/local/ once it differs from the seed", () => {
    const repoRoot = repo(exampleRepo);
    seedLocal({ repoRoot, env: {} });
    writeFileSync(join(repoRoot, "brand", "local", "og-image.png"), "mine");
    expect(exampleOutcome(loadProfile({ repoRoot, env: {} }), {}, repoRoot)).toBeUndefined();
  });

  it("refuses BRAND_PROFILE=example over a chapter profile", () => {
    const repoRoot = repo(chapterRepo);
    const env = { BRAND_PROFILE: "example" };
    const outcome = exampleOutcome(loadProfile({ repoRoot, env }), env);
    expect(outcome?.code).toBe(1);
    expect(outcome?.message).toMatch(/protects a chapter profile/);
  });

  it("refuses BRAND_PROFILE=example even where brand/ selects the example", () => {
    const repoRoot = repo(exampleRepo);
    const env = { BRAND_PROFILE: "example" };
    const outcome = exampleOutcome(loadProfile({ repoRoot, env }), env);
    expect(outcome?.code).toBe(1);
    expect(outcome?.message).toMatch(/protects a chapter profile/);
  });
});
