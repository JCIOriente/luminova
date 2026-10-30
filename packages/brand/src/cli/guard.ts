import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { z } from "zod";
import { fileSha256, sha256 } from "../hash.ts";
import {
  EXAMPLE_PROFILE,
  PROFILE_OVERRIDE_ENV,
  REPO_ROOT,
  loadProfile,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { IMAGE_PATHS, LOCAL_PROFILE, isUntouchedSeed, localLabel } from "../local-folder.ts";
import { BRAND_APPS, type BrandApp } from "../ports.ts";
import { isTable, type Brand } from "../schema.ts";
import { runBrandCommand } from "./main.ts";

const MIN_NEEDLE_LENGTH = 6;
const BUILD_COMMAND = "pnpm turbo run build --filter spotlight --filter backstage";

export interface NeedleExclusion {
  keyPath: string;
  reason: string;
}

export const NEEDLE_EXCLUSIONS: readonly NeedleExclusion[] = [
  { keyPath: "themeColor.*", reason: "the palette is shared by every profile (D16)" },
  {
    keyPath: "locale",
    reason: "the language is shared by every chapter of a country, not chapter identity (D10)",
  },
  {
    keyPath: "ogLocale",
    reason: "the Open Graph locale is shared by every chapter of a country (D10)",
  },
  {
    keyPath: "locality.country",
    reason: "the country is shared by every chapter in it, and the example names it (D10)",
  },
  {
    keyPath: "movementName",
    reason: "the movement's name is shared by every chapter, and the example says it (D10)",
  },
  {
    keyPath: "parentOrganization.*",
    reason: "the national federation is shared by every chapter of a country (D10)",
  },
];

// Case-sensitive on purpose: a case-insensitive "oriente" matches "oriented" in third-party code.
export const CHAPTER_REGEX = /[Jj][Cc][Ii][ -]?[Oo]riente|\bOriente\b|Santa Cruz/;

export interface Needle {
  value: string;
  keyPaths: string[];
}

export interface Finding {
  path: string;
  rule: string;
  source?: string;
}

export interface ScanResult {
  findings: Finding[];
  filesScanned: number;
}

function isExcluded(keyPath: string, exclusions: readonly NeedleExclusion[]): boolean {
  return exclusions.some(({ keyPath: excluded }) =>
    excluded.endsWith(".*") ? keyPath.startsWith(excluded.slice(0, -1)) : keyPath === excluded,
  );
}

/**
 * Every leaf string of `MIN_NEEDLE_LENGTH`+ characters, deduplicated by value. A leaf equal
 * to `example`'s at the same key is a default the chapter kept from the example's
 * brand.toml, which the example build shows by design, so it is no needle.
 */
export function collectNeedles(
  value: unknown,
  exclusions: readonly NeedleExclusion[],
  example?: unknown,
): Needle[] {
  const byValue = new Map<string, string[]>();
  const visit = (node: unknown, keyPath: string, shared: unknown) => {
    if (keyPath && isExcluded(keyPath, exclusions)) return;
    if (typeof node === "string") {
      if (node.length < MIN_NEEDLE_LENGTH || node === shared) return;
      byValue.set(node, [...(byValue.get(node) ?? []), keyPath]);
    } else if (Array.isArray(node)) {
      const items: unknown[] = Array.isArray(shared) ? shared : [];
      node.forEach((item, index) => visit(item, `${keyPath}[${index}]`, items[index]));
    } else if (isTable(node)) {
      const fields = isTable(shared) ? shared : {};
      for (const [key, child] of Object.entries(node)) {
        visit(child, keyPath ? `${keyPath}.${key}` : key, fields[key]);
      }
    }
  };
  visit(value, "", example);
  return [...byValue].map(([needle, keyPaths]) => ({ value: needle, keyPaths }));
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const hashesOf = (dir: string, files: readonly string[], labelPrefix: string) =>
  new Map(files.map((file) => [fileSha256(file), `${labelPrefix}${relative(dir, file)}`]));

/** sha256 → `${labelPrefix}<path relative to dir>` for every file under `dir`. */
export function assetHashes(dir: string, labelPrefix = ""): Map<string, string> {
  return hashesOf(dir, listFiles(dir), labelPrefix);
}

/**
 * The same for the chapter's 16 contract images in `dir` only: brand/local/ also holds
 * brand.toml, the manifest and the member's own files, none of which a build emits.
 */
export function imageHashes(dir: string, labelPrefix = ""): Map<string, string> {
  const images = IMAGE_PATHS.map((path) => join(dir, path)).filter((file) => existsSync(file));
  return hashesOf(dir, images, labelPrefix);
}

/**
 * The chapter build's own logo outputs. Spotlight re-encodes the logos to webp, so the
 * source PNG hashes alone would miss a leaked logo there.
 */
export function emittedLogoHashes(dist: string, labelPrefix = ""): Map<string, string> {
  const assets = join(dist, "assets");
  if (!existsSync(assets)) return new Map();
  return new Map(
    listFiles(assets)
      .filter((file) => basename(file).startsWith("logo-"))
      .map((file) => [fileSha256(file), `${labelPrefix}${relative(dist, file)}`]),
  );
}

// Every image and font format the builds emit carries NUL bytes in its header.
function isText(bytes: Uint8Array): boolean {
  return !bytes.includes(0);
}

export function scanDist(
  dir: string,
  {
    needles,
    hashes,
    regex,
  }: { needles: readonly Needle[]; hashes: Map<string, string>; regex: RegExp },
): ScanResult {
  const findings: Finding[] = [];
  const files = listFiles(dir);
  const global = new RegExp(regex.source, `${regex.flags.replace("g", "")}g`);
  for (const file of files) {
    const path = relative(dir, file);
    const bytes = readFileSync(file);
    const asset = hashes.get(sha256(bytes));
    if (asset) findings.push({ path, rule: `sha256 of ${asset}`, source: "asset" });
    if (!isText(bytes)) continue;
    const text = bytes.toString("utf8");
    for (const { value, keyPaths } of needles) {
      if (text.includes(value)) findings.push({ path, rule: value, source: keyPaths.join(", ") });
    }
    const matches = new Set(Array.from(text.matchAll(global), ([match]) => match));
    for (const match of matches) {
      findings.push({ path, rule: `regex ${regex.source} matched ${JSON.stringify(match)}` });
    }
  }
  return { findings, filesScanned: files.length };
}

export function formatFinding({ path, rule, source }: Finding): string {
  return source ? `${path}: ${rule} (${source})` : `${path}: ${rule}`;
}

const manifestSchema = z.object({ name: z.string(), theme_color: z.string() });

function readText(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

/** What the chapter's own production dist must still carry: the refactor cannot quietly change it. */
export function inverseChecks(dist: string, brand: Brand, app: BrandApp): string[] {
  if (!existsSync(dist)) {
    return [`${app}: ${dist} is missing; build it first with \`${BUILD_COMMAND}\``];
  }
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${app}: ${message}`);

  if (app === "spotlight") {
    const origin = brand.urls.spotlight;
    const html = readText(join(dist, "index.html")) ?? "";
    if (!html.includes(`<link rel="canonical" href="${origin}/"`)) {
      fail(`index.html lacks canonical ${origin}/`);
    }
    const ogImage = readdirSync(dist).find((name) => /^og-image\.[0-9a-f]{8}\.png$/.test(name));
    if (!ogImage) fail("no og-image.<8 hex>.png in dist");
    else if (!html.includes(`${origin}/${ogImage}`))
      fail(`index.html does not reference ${ogImage}`);
    for (const legacy of brand.og.legacyPaths) {
      if (!existsSync(join(dist, legacy))) fail(`legacy OG path ${legacy} not emitted`);
    }
    if (!(readText(join(dist, "sitemap.xml")) ?? "").includes(`<loc>${origin}/`)) {
      fail(`sitemap.xml does not list ${origin}`);
    }
  }

  const manifestText = readText(join(dist, "manifest.webmanifest"));
  const manifest = manifestSchema.safeParse(manifestText ? JSON.parse(manifestText) : undefined);
  if (!manifest.success) {
    fail("manifest.webmanifest is missing or lacks name/theme_color");
  } else {
    if (manifest.data.name !== brand.name) {
      fail(`manifest.webmanifest has name "${manifest.data.name}", expected name "${brand.name}"`);
    }
    if (manifest.data.theme_color !== brand.themeColor[app]) {
      fail(
        `manifest.webmanifest has theme_color ${manifest.data.theme_color}, expected ${brand.themeColor[app]}`,
      );
    }
  }

  const assetsDir = join(dist, "assets");
  const projectId = new RegExp(
    `["'\`]${brand.firebase.projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`,
  );
  const bundles = existsSync(assetsDir)
    ? listFiles(assetsDir).filter((file) => file.endsWith(".js"))
    : [];
  if (!bundles.some((file) => projectId.test(readFileSync(file, "utf8")))) {
    fail(`no JS in dist/assets carries projectId "${brand.firebase.projectId}"`);
  }
  return errors;
}

function withEnv<T>(overrides: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  Object.assign(process.env, overrides);
  return run().finally(() => {
    // The brand plugin writes the Firebase web config into process.env during a build.
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  });
}

async function buildExample(app: BrandApp, outDir: string, envDir: string): Promise<void> {
  const { build } = await import("vite");
  const root = join(REPO_ROOT, "apps", app);
  await withEnv(
    {
      // Hermetic: the example reads only brand/example/, never brand/local/'s real logos.
      [PROFILE_OVERRIDE_ENV]: EXAMPLE_PROFILE,
      // Process env wins over every .env file, so .env.local cannot turn on the emulator.
      VITE_FIREBASE_EMULATOR_ENABLED: "false",
    },
    () =>
      build({
        root,
        configFile: join(root, "vite.config.ts"),
        // An empty envDir keeps apps/*/.env.local out of the bundle.
        envDir,
        mode: "production",
        logLevel: "warn",
        build: { outDir, emptyOutDir: true },
      }),
  );
}

/**
 * How brand:guard ends before building anything when the profile is the example, or
 * brand/local/ is still the example install seeded; undefined when it is a chapter profile
 * to protect. A fork's brand/ holds no chapter profile in git.
 */
export function exampleOutcome(
  { slug, source }: Pick<LoadedProfile, "slug" | "source">,
  env: Env,
  repoRoot: string = REPO_ROOT,
): { code: 0 | 1; message: string } | undefined {
  if (slug === LOCAL_PROFILE && isUntouchedSeed(repoRoot)) {
    return {
      code: 0,
      message: `brand:guard: ${localLabel()} is still the example install seeded, so it holds no chapter to protect; nothing to check.`,
    };
  }
  if (slug !== EXAMPLE_PROFILE) return undefined;
  if (source === "example" && !env[PROFILE_OVERRIDE_ENV]?.trim()) {
    return {
      code: 0,
      message: "brand:guard: brand/ holds no chapter profile to protect; nothing to check.",
    };
  }
  return {
    code: 1,
    message: `brand:guard protects a chapter profile; "${EXAMPLE_PROFILE}" is the example it builds. Run it where brand/ holds a chapter profile, without ${PROFILE_OVERRIDE_ENV}.`,
  };
}

async function main(): Promise<number> {
  const started = performance.now();
  // The profile brand/ selects is the one CI just built.
  const chapter = loadProfile();
  const early = exampleOutcome(chapter, process.env);
  if (early) {
    (early.code === 0 ? console.log : console.error)(early.message);
    return early.code;
  }
  const { brand } = chapter;

  const inverseErrors = BRAND_APPS.flatMap((app) =>
    inverseChecks(join(REPO_ROOT, "apps", app, "dist"), brand, app),
  );

  const example = loadProfile({ profile: EXAMPLE_PROFILE });
  const needles = collectNeedles(brand, NEEDLE_EXCLUSIONS, example.brand);
  // The chapter's own images: brand/local/, or a committed chapter's assets/
  // (TRANSITIONAL (the JCI Oriente removal PR drops this)).
  const { assetsDir } = chapter;
  const hashes = imageHashes(assetsDir, `${relative(REPO_ROOT, assetsDir)}/`);
  for (const app of BRAND_APPS) {
    const dist = join(REPO_ROOT, "apps", app, "dist");
    for (const [hash, label] of emittedLogoHashes(dist, `apps/${app}/dist/`))
      hashes.set(hash, label);
  }

  const findings: string[] = [];
  let filesScanned = 0;
  const workDir = mkdtempSync(join(tmpdir(), "brand-guard-"));
  try {
    const envDir = join(workDir, "env");
    mkdirSync(envDir);
    for (const app of BRAND_APPS) {
      const outDir = join(workDir, app);
      await buildExample(app, outDir, envDir);
      const result = scanDist(outDir, { needles, hashes, regex: CHAPTER_REGEX });
      filesScanned += result.filesScanned;
      findings.push(...result.findings.map((finding) => `${app}: ${formatFinding(finding)}`));
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  for (const error of inverseErrors) console.error(`inverse: ${error}`);
  for (const finding of findings) console.error(`leak: ${finding}`);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (inverseErrors.length > 0 || findings.length > 0) {
    console.error(
      `brand:guard failed: ${inverseErrors.length} inverse error(s), ${findings.length} leak(s) (${seconds}s).`,
    );
    return 1;
  }
  console.log(
    `brand:guard OK: ${chapter.slug} dist intact; ${EXAMPLE_PROFILE} build clean of ${needles.length} needles, ${hashes.size} asset hashes and the regex across ${filesScanned} files (${seconds}s).`,
  );
  return 0;
}

if (import.meta.main) {
  await runBrandCommand("brand:guard", async () => process.exit(await main()));
}
