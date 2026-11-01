import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { CANARY_MARKER, canaryBackupDir, isUntouchedSeed } from "../local-folder.ts";
import {
  exampleRepo,
  localProfile,
  localRepo,
  recordLocal,
  writeChapter,
} from "../test-profiles.ts";
import { CANARY_CITY, CANARY_NAME, writeCanary } from "./canary.ts";
import { seedLocal } from "./seed.ts";
import {
  NEEDLE_EXCLUSIONS,
  assetHashes,
  profileNeedles,
  imageHashes,
  chapterTargets,
  emittedLogoHashes,
  formatFinding,
  guardMode,
  inverseChecks,
  scanDist,
  withCanaryChapter,
} from "./guard.ts";

const chapter = localProfile();
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

describe("profileNeedles", () => {
  const needles = profileNeedles(chapter);
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
    // The slug is the folder name, "local": five characters.
    expect(chapter.slug).toHaveLength(5);
    expect(paths).not.toContain("slug");
  });

  it("skips a value the chapter shares with the example at the same key: a default it kept", () => {
    const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    const own = {
      brand: { ...example.brand, name: "JCI Valle Propia", legalName: example.brand.name },
      siteContent: example.siteContent,
    };
    expect(profileNeedles(own, example)).toEqual([
      { value: "JCI Valle Propia", keyPaths: ["name"] },
      { value: example.brand.name, keyPaths: ["legalName"] },
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
  const needles = profileNeedles(
    chapter,
    loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE }),
  );
  const scan = (hashes: Map<string, string> = new Map()) => scanDist(dist, { needles, hashes });

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
    const bytes = readFileSync(join(chapter.assetsDir, "og-image.png"));
    put("og-image.12345678.png", bytes);
    const { findings } = scan(imageHashes(chapter.assetsDir, "brand/local/"));
    expect(findings.map(formatFinding)).toEqual([
      "og-image.12345678.png: sha256 of brand/local/og-image.png (asset)",
    ]);
  });

  it("skips binary files: only text can carry a needle", () => {
    put("e.bin", Buffer.concat([Buffer.from([0]), Buffer.from(brand.name)]));
    expect(scan().findings).toEqual([]);
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

describe("guardMode", () => {
  const roots: string[] = [];
  const repo = (make: () => string) => {
    const root = make();
    roots.push(root);
    return root;
  };
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const modeOf = (repoRoot: string, env: Record<string, string> = {}) =>
    guardMode(loadProfile({ repoRoot, env }), env, repoRoot);

  it("protects the chapter in brand/local/", () => {
    expect(modeOf(repo(localRepo))).toEqual({ kind: "chapter" });
  });

  it("checks the canary chapter where brand/ holds no chapter (upstream CI, a fresh fork)", () => {
    expect(modeOf(repo(exampleRepo))).toMatchObject({ kind: "canary" });
  });

  it("checks the canary chapter while brand/local/ is still the seeded example", () => {
    const repoRoot = repo(exampleRepo);
    seedLocal({ repoRoot, env: {} });
    expect(modeOf(repoRoot)).toMatchObject({
      kind: "canary",
      reason: expect.stringMatching(/brand\/local\/ is still the example install seeded/),
    });
  });

  it("protects brand/local/ once it differs from the seed", () => {
    const repoRoot = repo(exampleRepo);
    seedLocal({ repoRoot, env: {} });
    writeFileSync(join(repoRoot, "brand", "local", "og-image.png"), "mine");
    expect(modeOf(repoRoot)).toEqual({ kind: "chapter" });
  });

  it("refuses to touch a brand/local/ that holds files but no brand.toml", () => {
    const repoRoot = repo(exampleRepo);
    mkdirSync(join(repoRoot, "brand", "local"));
    writeFileSync(join(repoRoot, "brand", "local", "notes.txt"), "mine");
    expect(modeOf(repoRoot)).toMatchObject({
      kind: "refuse",
      message: expect.stringMatching(/brand\/local\/ holds files but no brand\.toml/),
    });
  });

  it("refuses while another live brand:guard's canary is in brand/local/", () => {
    const repoRoot = repo(exampleRepo);
    const local = join(repoRoot, "brand", "local");
    writeCanary(local);
    writeFileSync(join(local, CANARY_MARKER), `${process.ppid}\n`);
    expect(modeOf(repoRoot)).toEqual({
      kind: "refuse",
      message: `another brand:guard is running (pid ${process.ppid}); wait for it to finish`,
    });
  });

  it("refuses BRAND_PROFILE=example, over a chapter or not", () => {
    for (const repoRoot of [repo(localRepo), repo(exampleRepo)]) {
      expect(modeOf(repoRoot, { BRAND_PROFILE: EXAMPLE_PROFILE })).toMatchObject({
        kind: "refuse",
        message: expect.stringMatching(/protects a chapter profile/),
      });
    }
  });
});

describe("the canary chapter", () => {
  let root: string;
  let canary: LoadedProfile;
  const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });

  beforeEach(() => {
    root = exampleRepo("brand-guard-canary-");
    writeCanary(join(root, "brand", "local"));
    canary = loadProfile({ repoRoot: root, env: {} });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("loads as a connected chapter in brand/local/", () => {
    expect(canary).toMatchObject({
      slug: "local",
      localOnly: false,
      brand: { name: CANARY_NAME, locality: { city: CANARY_CITY } },
    });
  });

  it("holds a sentinel at every key where the example holds a needle-sized string", () => {
    const paths = (needles: ReturnType<typeof profileNeedles>) =>
      new Set(needles.flatMap(({ keyPaths }) => keyPaths));
    const exampleKeys = paths(profileNeedles(example));
    const canaryKeys = paths(profileNeedles(canary, example));
    // The slug is the folder name ("local"), too short to be a needle.
    const missing = [...exampleKeys].filter((key) => key !== "slug" && !canaryKeys.has(key));
    expect(missing).toEqual([]);
    expect(canaryKeys).toContain("siteContent.mvv.mision");
  });

  it("takes no needle from an enum value the code itself names", () => {
    const paths = profileNeedles(canary, example).flatMap(({ keyPaths }) => keyPaths);
    expect(paths).not.toContain("siteContent.linktree.socials[0].platform");
    expect(paths).not.toContain("siteContent.linktree.links[0].icon");
    expect(paths).toContain("siteContent.linktree.socials[0].url");
  });

  it("has 16 images, none sharing bytes with another or with the example's", () => {
    const own = imageHashes(canary.assetsDir);
    expect(own.size).toBe(ASSET_CONTRACT.length);
    for (const hash of assetHashes(example.assetsDir).keys()) expect(own.has(hash)).toBe(false);
  });

  it("passes a clean neutral dist, and fails one that carries a planted canary string or image", () => {
    const needles = profileNeedles(canary, example);
    const hashes = imageHashes(canary.assetsDir, "canary/");
    put("index.html", `<title>${example.brand.name}</title>`);
    put("assets/index-abc.js", `const c="${example.brand.locality.city}";`);
    expect(scanDist(dist, { needles, hashes }).findings).toEqual([]);

    put("assets/leak.js", `const c="${CANARY_CITY}";`);
    put("og-image.0a1b2c3d.png", readFileSync(join(canary.assetsDir, "og-image.png")));
    expect(scanDist(dist, { needles, hashes }).findings.map(formatFinding)).toEqual([
      "assets/leak.js: Qwertópolis (locality.city)",
      "og-image.0a1b2c3d.png: sha256 of canary/og-image.png (asset)",
    ]);
  });
});

describe("chapterTargets", () => {
  it("takes a needle from the chapter's own site texts, so a leaked one fails chapter mode", () => {
    const root = exampleRepo("brand-guard-chapter-");
    try {
      const mission = "Valle: nuestra misión propia del capítulo";
      writeChapter(root, { brand: { mvv: { mision: mission } } });
      const own = loadProfile({ repoRoot: root, env: {} });
      const example = loadProfile({ repoRoot: root, profile: EXAMPLE_PROFILE });
      const { needles, hashes } = chapterTargets(own, example, root);
      put("assets/index-abc.js", `const m="${mission}";`);
      expect(scanDist(dist, { needles, hashes }).findings.map(formatFinding)).toEqual([
        `assets/index-abc.js: ${mission} (siteContent.mvv.mision)`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** path -> sha256 of every file under `dir`, or null when it is absent. */
function snapshot(dir: string): Record<string, string> | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  );
  return Object.fromEntries(
    files.map((entry) => {
      const file = join(entry.parentPath, entry.name);
      return [relative(dir, file), createHash("sha256").update(readFileSync(file)).digest("hex")];
    }),
  );
}

/** A pid no process holds any more: the one of a child that already exited. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

describe("withCanaryChapter", () => {
  let root: string;
  beforeEach(() => {
    root = exampleRepo("brand-guard-with-canary-");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const local = () => join(root, "brand", "local");
  const backup = () => canaryBackupDir(root);

  /** brand/local/ seeded, plus a member's own files the seed never wrote. */
  function seedWithExtras() {
    seedLocal({ repoRoot: root, env: {} });
    writeFileSync(join(local(), "notes.txt"), "my notes");
    mkdirSync(join(local(), "masters"));
    writeFileSync(join(local(), "masters", "icon.svg"), "<svg/>");
  }

  /** What an interrupted run leaves: brand/local/ set aside, the canary of a dead process in it. */
  function leaveCanary({ withBackup }: { withBackup: boolean }) {
    if (withBackup) renameSync(local(), backup());
    writeCanary(local());
    writeFileSync(join(local(), CANARY_MARKER), `${deadPid()}\n`);
  }

  it("holds the canary in brand/local/ for the build, then removes it", async () => {
    const seen = await withCanaryChapter(root, async (canary) => {
      expect(readFileSync(join(local(), "brand.toml"), "utf8")).toContain(CANARY_NAME);
      expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe(CANARY_NAME);
      return canary.brand.name;
    });
    expect(seen).toBe(CANARY_NAME);
    expect(existsSync(local())).toBe(false);
    expect(existsSync(backup())).toBe(false);
  });

  it("puts a seeded brand/local/ back exactly, the member's own files too, when the build fails", async () => {
    seedWithExtras();
    const before = snapshot(local());
    const failing = withCanaryChapter(root, async () => {
      expect(snapshot(backup())).toEqual(before);
      expect(existsSync(join(local(), CANARY_MARKER))).toBe(true);
      throw new Error("build failed");
    });
    await expect(failing).rejects.toThrow("build failed");
    expect(snapshot(local())).toEqual(before);
    expect(isUntouchedSeed(root)).toBe(true);
    expect(existsSync(backup())).toBe(false);
  });

  it("restores the folder an interrupted run set aside on the next load, with a notice", () => {
    seedWithExtras();
    const before = snapshot(local());
    leaveCanary({ withBackup: true });
    const notice = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).not.toBe(CANARY_NAME);
    expect(snapshot(local())).toEqual(before);
    expect(existsSync(backup())).toBe(false);
    expect(notice).toHaveBeenCalledOnce();
    expect(notice.mock.calls[0]?.[0]).toMatch(/interrupted brand:guard/);
  });

  it("restores the set-aside folder when a kill left brand/local/ empty or holding only the marker", () => {
    for (const leftover of [[], [CANARY_MARKER]]) {
      seedWithExtras();
      const before = snapshot(local());
      renameSync(local(), backup());
      mkdirSync(local());
      for (const name of leftover) writeFileSync(join(local(), name), "");
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(loadProfile({ repoRoot: root, env: {} }).brand.name).not.toBe(CANARY_NAME);
      expect(snapshot(local())).toEqual(before);
      expect(existsSync(backup())).toBe(false);
      rmSync(local(), { recursive: true, force: true });
    }
  });

  it("removes a leftover canary that set nothing aside: brand/local/ was absent", () => {
    leaveCanary({ withBackup: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadProfile({ repoRoot: root, env: {} }).source).toBe("example");
    expect(existsSync(local())).toBe(false);
  });

  it("seeds brand/local/ again where install finds a leftover canary that set nothing aside", () => {
    leaveCanary({ withBackup: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(seedLocal({ repoRoot: root, env: {} })).toBe(true);
    expect(isUntouchedSeed(root)).toBe(true);
  });

  it("leaves a canary alone while the run that wrote it is alive", () => {
    writeCanary(local());
    writeFileSync(join(local(), CANARY_MARKER), `${process.pid}\n`);
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe(CANARY_NAME);
  });

  it("never sets a real chapter aside: its folder stays as it is, whatever it holds", () => {
    const repoRoot = localRepo("brand-guard-real-");
    try {
      writeFileSync(join(repoRoot, "brand", "local", "notes.txt"), "mine");
      const before = snapshot(join(repoRoot, "brand", "local"));
      expect(guardMode(loadProfile({ repoRoot, env: {} }), {}, repoRoot)).toEqual({
        kind: "chapter",
      });
      expect(snapshot(join(repoRoot, "brand", "local"))).toEqual(before);
      expect(existsSync(canaryBackupDir(repoRoot))).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  describe("in a process a signal stops", () => {
    const guardUrl = pathToFileURL(join(import.meta.dirname, "guard.ts")).href;
    /** Runs withCanaryChapter over `root` in a child whose body waits; resolves once the canary is in place. */
    function startChild() {
      const script = join(root, "child.mjs");
      writeFileSync(
        script,
        `import { withCanaryChapter } from ${JSON.stringify(guardUrl)};
await withCanaryChapter(${JSON.stringify(root)}, async () => {
  process.stdout.write("ready\\n");
  await new Promise((resolve) => setTimeout(resolve, 60_000));
});
`,
      );
      const child = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const exited = new Promise<NodeJS.Signals | null>((resolve) =>
        child.on("exit", (_code, signal) => resolve(signal)),
      );
      const ready = new Promise<void>((resolve) =>
        child.stdout.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("ready")) resolve();
        }),
      );
      return { child, ready, exited, stderr: () => stderr };
    }

    it("still dies by the signal when putting brand/local/ back fails, and says how to fix it", async () => {
      seedWithExtras();
      const { child, ready, exited, stderr } = startChild();
      await ready;
      // brand/local/ no longer looks like the canary, so the restore refuses to touch it.
      rmSync(local(), { recursive: true, force: true });
      mkdirSync(local());
      writeFileSync(join(local(), "other.txt"), "someone else's");
      child.kill("SIGINT");
      expect(await exited).toBe("SIGINT");
      expect(stderr()).toMatch(/could not put brand\/local\/ back/);
      expect(stderr()).toMatch(/brand\/\.local-canary-backup\//);
      expect(existsSync(backup())).toBe(true);
    }, 20_000);

    it("puts brand/local/ back on SIGINT, then dies by that signal", async () => {
      seedWithExtras();
      const before = snapshot(local());
      const { child, ready, exited } = startChild();
      await ready;
      expect(existsSync(join(local(), CANARY_MARKER))).toBe(true);
      child.kill("SIGINT");
      expect(await exited).toBe("SIGINT");
      expect(snapshot(local())).toEqual(before);
      expect(existsSync(backup())).toBe(false);
    }, 20_000);

    it("leaves what the next load restores after a SIGKILL no handler sees", async () => {
      seedWithExtras();
      const before = snapshot(local());
      const { child, ready, exited } = startChild();
      await ready;
      child.kill("SIGKILL");
      expect(await exited).toBe("SIGKILL");
      expect(existsSync(backup())).toBe(true);
      vi.spyOn(console, "error").mockImplementation(() => {});
      loadProfile({ repoRoot: root, env: {} });
      expect(snapshot(local())).toEqual(before);
      expect(existsSync(backup())).toBe(false);
    }, 20_000);
  });
});
