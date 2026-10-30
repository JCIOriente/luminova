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
import { basename, join, relative } from "node:path";
import { z } from "zod";
import { fileSha256, sha256 } from "../hash.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  PROFILE_OVERRIDE_ENV,
  REPO_ROOT,
  errorMessage,
  loadProfile,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import {
  BACKUP_LABEL,
  CANARY_MARKER,
  IMAGE_PATHS,
  LOCAL_PROFILE,
  canaryBackupDir,
  isUntouchedSeed,
  liveCanaryPid,
  localDir,
  localLabel,
  recoverInterruptedCanary,
  restoreFromCanary,
} from "../local-folder.ts";
import { BRAND_APPS, type BrandApp } from "../ports.ts";
import { formatRemedies, type Remedy } from "../remedy.ts";
import { isTable, type Brand } from "../schema.ts";
import { writeCanary } from "./canary.ts";
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

/** Site-text keys whose values are enum members, which the code names in every build. */
const SITE_CONTENT_EXCLUSIONS: readonly NeedleExclusion[] = [
  { keyPath: "siteContent.linktree.socials.platform", reason: "an enum value the code names" },
  { keyPath: "siteContent.linktree.links.icon", reason: "an enum value the code names" },
];

/** Array indices do not matter: `a[2].b` matches the exclusion `a.b`. */
function isExcluded(keyPath: string, exclusions: readonly NeedleExclusion[]): boolean {
  const path = keyPath.replace(/\[\d+\]/g, "");
  return exclusions.some(({ keyPath: excluded }) =>
    excluded.endsWith(".*") ? path.startsWith(excluded.slice(0, -1)) : path === excluded,
  );
}

/**
 * Every leaf string of `MIN_NEEDLE_LENGTH`+ characters, deduplicated by value. A leaf equal
 * to `example`'s at the same key is a default the chapter kept from the example's
 * brand.toml, which the example build shows by design, so it is no needle.
 */
function collectNeedles(
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

/**
 * A profile's needles: its brand's (with the exclusions) and its site texts' (key paths under
 * `siteContent.`), less what it kept from `example`.
 */
export function profileNeedles(
  { brand, siteContent }: Pick<LoadedProfile, "brand" | "siteContent">,
  example?: Pick<LoadedProfile, "brand" | "siteContent">,
): Needle[] {
  const byValue = new Map<string, string[]>();
  const all = [
    ...collectNeedles(brand, NEEDLE_EXCLUSIONS, example?.brand),
    ...collectNeedles(
      { siteContent },
      SITE_CONTENT_EXCLUSIONS,
      example && { siteContent: example.siteContent },
    ),
  ];
  for (const { value, keyPaths } of all) {
    byValue.set(value, [...(byValue.get(value) ?? []), ...keyPaths]);
  }
  return [...byValue].map(([value, keyPaths]) => ({ value, keyPaths }));
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
  { needles, hashes }: { needles: readonly Needle[]; hashes: Map<string, string> },
): ScanResult {
  const findings: Finding[] = [];
  const files = listFiles(dir);
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
 * What brand:guard checks: the chapter brand/local/ holds (its dist, and the example build
 * against it); the canary chapter where brand/ holds none (upstream CI, a fork before
 * brand:init, a brand/local/ still the seed); or nothing, with the reason.
 */
export type GuardMode =
  { kind: "chapter" } | { kind: "canary"; reason: string } | { kind: "refuse"; message: string };

export function guardMode(
  { slug, source }: Pick<LoadedProfile, "slug" | "source">,
  env: Env,
  repoRoot: string = REPO_ROOT,
): GuardMode {
  const running = liveCanaryPid(repoRoot);
  if (running !== null && running !== process.pid) {
    return {
      kind: "refuse",
      message: `another brand:guard is running (pid ${running}); wait for it to finish`,
    };
  }
  if (slug === LOCAL_PROFILE && isUntouchedSeed(repoRoot)) {
    return {
      kind: "canary",
      reason: `${localLabel()} is still the example install seeded, so it holds no chapter`,
    };
  }
  if (slug !== EXAMPLE_PROFILE) return { kind: "chapter" };
  if (source !== "example" || env[PROFILE_OVERRIDE_ENV]?.trim()) {
    return {
      kind: "refuse",
      message: `brand:guard protects a chapter profile; "${EXAMPLE_PROFILE}" is the example it builds. Run it without ${PROFILE_OVERRIDE_ENV}.`,
    };
  }
  if (existsSync(localDir(repoRoot))) {
    return {
      kind: "refuse",
      message: `brand:guard: ${localLabel()} holds files but no brand.toml, and the canary chapter is written there. Move them out of ${localLabel()}, or make it your chapter's with pnpm brand:init.`,
    };
  }
  return { kind: "canary", reason: "brand/ holds no chapter" };
}

const STOP_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const RESTORE_BY_HAND: Remedy[] = [
  {
    change: `delete the canary chapter in ${localLabel()} (or move aside what is there now), then rename ${BACKUP_LABEL} back to ${localLabel()}`,
  },
];

/**
 * Runs `body` with the canary chapter in brand/local/, where a chapter's brand lives, so the
 * example build next to it proves it never reads that folder. brand/local/ is absent or the
 * untouched seed (guardMode); it is renamed aside, member's own files and all, and renamed
 * back afterwards, whatever `body` does. SIGINT and SIGTERM restore it before the process
 * dies of them; what a SIGKILL leaves, the next loadProfile restores (the canary's marker).
 */
export async function withCanaryChapter<T>(
  repoRoot: string,
  body: (canary: LoadedProfile) => Promise<T>,
): Promise<T> {
  const recovered = recoverInterruptedCanary(repoRoot);
  if (recovered) console.error(`brand:guard: ${recovered}`);
  const dir = localDir(repoRoot);
  const backup = canaryBackupDir(repoRoot);
  if (existsSync(backup)) {
    throw new BrandConfigError(
      [`brand:guard: another brand:guard is running: its canary chapter is in ${localLabel()}`],
      [{ change: "wait for it to finish, then run brand:guard again" }],
    );
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const signal of STOP_SIGNALS) process.off(signal, onSignal);
    restoreFromCanary(repoRoot);
  };
  const onSignal = (signal: NodeJS.Signals) => {
    // A throw here would end the process with an uncaught exception instead of the signal.
    try {
      restore();
    } catch (error) {
      console.error(
        `brand:guard: could not put ${localLabel()} back on ${signal}: ${errorMessage(error)}\n${formatRemedies(RESTORE_BY_HAND)}`,
      );
    }
    process.kill(process.pid, signal);
  };
  for (const signal of STOP_SIGNALS) process.once(signal, onSignal);
  try {
    if (existsSync(dir)) renameSync(dir, backup);
    mkdirSync(dir);
    writeFileSync(join(dir, CANARY_MARKER), `${process.pid}\n`);
    writeCanary(dir);
    return await body(loadProfile({ repoRoot, profile: LOCAL_PROFILE }));
  } finally {
    restore();
  }
}

interface ExampleScan {
  findings: string[];
  filesScanned: number;
  needleCount: number;
  hashCount: number;
}

/** Builds the example for each app and scans it for the needles and hashes. */
async function scanExampleBuilds(
  needles: readonly Needle[],
  hashes: Map<string, string>,
): Promise<ExampleScan> {
  const findings: string[] = [];
  let filesScanned = 0;
  const workDir = mkdtempSync(join(tmpdir(), "brand-guard-"));
  try {
    const envDir = join(workDir, "env");
    mkdirSync(envDir);
    for (const app of BRAND_APPS) {
      const outDir = join(workDir, app);
      await buildExample(app, outDir, envDir);
      const result = scanDist(outDir, { needles, hashes });
      filesScanned += result.filesScanned;
      findings.push(...result.findings.map((finding) => `${app}: ${formatFinding(finding)}`));
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  return { findings, filesScanned, needleCount: needles.length, hashCount: hashes.size };
}

const seconds = (started: number) => ((performance.now() - started) / 1000).toFixed(1);

/** The canary's needles and images, against an example build made beside it. */
async function guardCanary(reason: string, started: number): Promise<number> {
  console.log(`brand:guard: ${reason}; checking the canary chapter instead.`);
  const example = loadProfile({ profile: EXAMPLE_PROFILE });
  const { findings, filesScanned, needleCount, hashCount } = await withCanaryChapter(
    REPO_ROOT,
    (canary) =>
      scanExampleBuilds(profileNeedles(canary, example), imageHashes(canary.assetsDir, "canary/")),
  );
  for (const finding of findings) console.error(`leak: ${finding}`);
  if (findings.length > 0) {
    console.error(
      `brand:guard failed: the ${EXAMPLE_PROFILE} build carries ${findings.length} value(s) of the canary chapter in ${localLabel()} (${seconds(started)}s).`,
    );
    return 1;
  }
  console.log(
    `brand:guard OK: ${EXAMPLE_PROFILE} build clean of the canary chapter's ${needleCount} needles and ${hashCount} image hashes across ${filesScanned} files (${seconds(started)}s).`,
  );
  return 0;
}

/**
 * What chapter mode looks for in the example build: the chapter's needles and images, and
 * the logos its own builds in `repoRoot`'s apps/<app>/dist emitted.
 */
export function chapterTargets(
  chapter: LoadedProfile,
  example: LoadedProfile,
  repoRoot: string = REPO_ROOT,
): { needles: Needle[]; hashes: Map<string, string> } {
  const needles = profileNeedles(chapter, example);
  const { assetsDir } = chapter;
  const hashes = imageHashes(assetsDir, `${relative(repoRoot, assetsDir)}/`);
  for (const app of BRAND_APPS) {
    const dist = join(repoRoot, "apps", app, "dist");
    for (const [hash, label] of emittedLogoHashes(dist, `apps/${app}/dist/`))
      hashes.set(hash, label);
  }
  return { needles, hashes };
}

async function main(): Promise<number> {
  const started = performance.now();
  // The profile brand/ selects is the one CI just built.
  const chapter = loadProfile();
  const mode = guardMode(chapter, process.env);
  if (mode.kind === "refuse") {
    console.error(mode.message);
    return 1;
  }
  if (mode.kind === "canary") return guardCanary(mode.reason, started);
  const { brand } = chapter;

  const inverseErrors = BRAND_APPS.flatMap((app) =>
    inverseChecks(join(REPO_ROOT, "apps", app, "dist"), brand, app),
  );

  const example = loadProfile({ profile: EXAMPLE_PROFILE });
  const { needles, hashes } = chapterTargets(chapter, example);
  const { findings, filesScanned, needleCount, hashCount } = await scanExampleBuilds(
    needles,
    hashes,
  );

  for (const error of inverseErrors) console.error(`inverse: ${error}`);
  for (const finding of findings) console.error(`leak: ${finding}`);
  if (inverseErrors.length > 0 || findings.length > 0) {
    console.error(
      `brand:guard failed: ${inverseErrors.length} inverse error(s), ${findings.length} leak(s) (${seconds(started)}s).`,
    );
    return 1;
  }
  console.log(
    `brand:guard OK: ${chapter.slug} dist intact; ${EXAMPLE_PROFILE} build clean of ${needleCount} needles and ${hashCount} asset hashes across ${filesScanned} files (${seconds(started)}s).`,
  );
  return 0;
}

if (import.meta.main) {
  await runBrandCommand("brand:guard", async () => process.exit(await main()));
}
