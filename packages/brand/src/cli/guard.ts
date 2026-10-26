import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { z } from "zod";
import { sha256 } from "../hash.ts";
import { NEUTRAL_PROFILE, REPO_ROOT, loadProfile } from "../load-profile.ts";
import { BRAND_APPS, type BrandApp } from "../ports.ts";
import type { Brand } from "../schema.ts";
import { checkFlags, exitOnFailure } from "./main.ts";

const MIN_NEEDLE_LENGTH = 6;
const BUILD_COMMAND = "pnpm turbo run build --filter spotlight --filter backstage";

export interface NeedleExclusion {
  keyPath: string;
  reason: string;
}

export const NEEDLE_EXCLUSIONS: readonly NeedleExclusion[] = [
  { keyPath: "$schema", reason: "editor hint pointing at the shared schema, never bundled" },
  { keyPath: "themeColor.*", reason: "the palette is shared by every profile (D16)" },
  { keyPath: "locale", reason: "the language is product-wide, not chapter identity" },
  { keyPath: "ogLocale", reason: "the Open Graph locale is product-wide, not chapter identity" },
  {
    keyPath: "locality.country",
    reason: "the Bolivian phone rule is product-wide until follow-up 3",
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

/** Every leaf string of `MIN_NEEDLE_LENGTH`+ characters, deduplicated by value. */
export function collectNeedles(value: unknown, exclusions: readonly NeedleExclusion[]): Needle[] {
  const byValue = new Map<string, string[]>();
  const visit = (node: unknown, keyPath: string) => {
    if (keyPath && isExcluded(keyPath, exclusions)) return;
    if (typeof node === "string") {
      if (node.length < MIN_NEEDLE_LENGTH) return;
      byValue.set(node, [...(byValue.get(node) ?? []), keyPath]);
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${keyPath}[${index}]`));
    } else if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        visit(child, keyPath ? `${keyPath}.${key}` : key);
      }
    }
  };
  visit(value, "");
  return [...byValue].map(([needle, keyPaths]) => ({ value: needle, keyPaths }));
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** sha256 → `${labelPrefix}<path relative to dir>` for every file under `dir`. */
export function assetHashes(dir: string, labelPrefix = ""): Map<string, string> {
  return new Map(
    listFiles(dir).map((file) => [
      sha256(readFileSync(file)),
      `${labelPrefix}${relative(dir, file)}`,
    ]),
  );
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
      .map((file) => [sha256(readFileSync(file)), `${labelPrefix}${relative(dist, file)}`]),
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

async function buildNeutral(app: BrandApp, outDir: string, envDir: string): Promise<void> {
  const { build } = await import("vite");
  const root = join(REPO_ROOT, "apps", app);
  await withEnv(
    {
      BRAND_PROFILE: NEUTRAL_PROFILE,
      // Hermetic: never a developer's pulled brand-assets/ of real logos.
      BRAND_ASSETS_DIR: `brand/${NEUTRAL_PROFILE}/assets`,
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

async function main(): Promise<number> {
  const started = performance.now();
  // The profile brand/ selects is the one CI just built.
  const chapter = loadProfile();
  if (chapter.slug === NEUTRAL_PROFILE) {
    console.error(
      `brand:guard protects a chapter profile; "${NEUTRAL_PROFILE}" is the neutral one. Run it without BRAND_PROFILE or --profile, so brand/ selects the chapter.`,
    );
    return 1;
  }
  const { brand } = chapter;

  const inverseErrors = BRAND_APPS.flatMap((app) =>
    inverseChecks(join(REPO_ROOT, "apps", app, "dist"), brand, app),
  );

  const needles = collectNeedles(brand, NEEDLE_EXCLUSIONS);
  // An adopter's marks live in the gitignored brand-assets/, not in the profile folder.
  const assetsDir = join(chapter.dir, "assets");
  const hashes = existsSync(assetsDir)
    ? assetHashes(assetsDir, `${relative(REPO_ROOT, assetsDir)}/`)
    : new Map<string, string>();
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
      await buildNeutral(app, outDir, envDir);
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
    `brand:guard OK: ${chapter.slug} dist intact; ${NEUTRAL_PROFILE} build clean of ${needles.length} needles, ${hashes.size} asset hashes and the regex across ${filesScanned} files (${seconds}s).`,
  );
  return 0;
}

if (import.meta.main) {
  await exitOnFailure(() => checkFlags("brand:guard", {}));
  process.exit(await main());
}
