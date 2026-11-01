import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_FILE, readBrandToml, resolveBrandFile } from "./brand-file.ts";
import { BrandConfigError, errorMessage, issueLines, type SchemaIssue } from "./errors.ts";
import { LOCAL_PROFILE, localDir, recoverInterruptedCanary } from "./local-folder.ts";
import type { Remedy } from "./remedy.ts";
import { SLUG_MESSAGE, SLUG_PATTERN, isDemoProject, type Brand, type Table } from "./schema.ts";
import type { SiteContent } from "./site-content.ts";

export { BrandConfigError, errorMessage };
export { demoProjectId, isDemoProject } from "./schema.ts";

/**
 * The committed, chapter-neutral example: tests and `brand:guard` build it, `brand:init`
 * starts from it, it can never ship, and its brand.toml is the base layer of every chapter's.
 */
export const EXAMPLE_PROFILE = "example";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** `brand/<slug>/brand.toml`, as messages name it. */
export const brandFileLabel = (slug: string) => `brand/${slug}/${BRAND_FILE}`;

/** A profile that cannot be located: a malformed slug or no `brand/<slug>/brand.toml`. */
export class ProfileNotFoundError extends BrandConfigError {
  override name = "ProfileNotFoundError";
}

export type Env = Readonly<Record<string, string | undefined>>;

/** Parses JSON text; `label` prefixes the error, e.g. `.brand-release.json`. */
export function parseJsonText(
  text: string,
  label: string,
  remedies: readonly Remedy[] = [],
): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new BrandConfigError([`${label}: not valid JSON (${errorMessage(error)})`], remedies);
  }
}

/** A JSON file someone edits: errors say which file to fix. */
export function readJsonFile(file: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new BrandConfigError(
      [`${label}: cannot read (${errorMessage(error)})`],
      [{ change: `check that ${label} exists and is a readable file` }],
    );
  }
  return parseJsonText(text, label, [{ change: `fix the JSON syntax in ${label}` }]);
}

/** Error lines for schema issues in a JSON file or output, `<label> <dotted.path>: <what>`. */
export function issuesToBrandError(
  label: string,
  issues: readonly SchemaIssue[],
  remedies: readonly Remedy[] = [],
): BrandConfigError {
  const where = (path: readonly PropertyKey[]) =>
    `${label} ${path.map(String).join(".") || "(root)"}`;
  return new BrandConfigError(
    issues.flatMap((issue) => issueLines(issue, where)),
    remedies,
  );
}

/**
 * Where a command's profile came from: named by its caller (tests, tooling), the tooling
 * override, or brand/ itself (brand/local/, else the example).
 */
export type ProfileSource = ExplicitSource | DiscoveredSource;
/** Chosen by hand, for one command. */
export type ExplicitSource = "named" | "override";
/** Chosen by what brand/ holds. */
export type DiscoveredSource = "local" | "example";

export const isExplicitSource = (source: ProfileSource): source is ExplicitSource =>
  source === "named" || source === "override";

export interface LoadedProfile {
  slug: string;
  dir: string;
  /** The folder the 16 images are read from: brand/local/, or the profile's own assets/. */
  assetsDir: string;
  brand: Brand;
  /** The site texts of the same brand.toml: spotlight's fallback and the seeds' content. */
  siteContent: SiteContent;
  source: ProfileSource;
  warnings: string[];
  /**
   * The profile runs only in the emulators: a `demo-` project, from `brand:init` without a
   * Firebase project, until brand:init connects a real one.
   */
  localOnly: boolean;
}

interface Selection {
  slug: string;
  source: ProfileSource;
  /** What brand/ selects, when an override needed it for its warning; null when it has no single choice. */
  discovered?: string | null;
}

export interface LoadProfileOptions {
  repoRoot?: string;
  env?: Env;
  profile?: string;
}

/** A test seam: tools set it for a single build (brand:guard's neutral build); a person never needs to. */
export const PROFILE_OVERRIDE_ENV = "BRAND_PROFILE";

/** How a command tells the user where its profile came from. */
export const SOURCE_LABEL: Readonly<Record<ProfileSource, string>> = {
  named: "named by the caller",
  override: `from ${PROFILE_OVERRIDE_ENV}`,
  local: "your chapter's brand in brand/local/",
  example: "the example: brand/local/ holds no brand.toml (pnpm install seeds one)",
};

export const REMOVE_OVERRIDE: Remedy = {
  change: `remove ${PROFILE_OVERRIDE_ENV} from your environment, and its export line from your shell startup file if you added one`,
  run: `unset ${PROFILE_OVERRIDE_ENV}`,
  where: "shell",
};

/** brand/ has no profile to select: neither brand/local/brand.toml nor the example. */
export class ProfileSelectionError extends BrandConfigError {
  override name = "ProfileSelectionError";
}

/** Profile folders (each with a brand.toml), sorted. */
function availableProfiles(repoRoot: string): string[] {
  const brandDir = join(repoRoot, "brand");
  if (!existsSync(brandDir)) return [];
  return readdirSync(brandDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(brandDir, entry.name, BRAND_FILE)))
    .map((entry) => entry.name)
    .sort();
}

/**
 * What brand/ selects: brand/local/brand.toml, else the example. CD always selects
 * brand/local/: it pulls brand.toml there first.
 */
export function discoverProfile(repoRoot: string = REPO_ROOT): {
  slug: string;
  source: DiscoveredSource;
} {
  if (existsSync(join(localDir(repoRoot), BRAND_FILE))) {
    return { slug: LOCAL_PROFILE, source: "local" };
  }
  if (existsSync(join(repoRoot, "brand", EXAMPLE_PROFILE, BRAND_FILE))) {
    return { slug: EXAMPLE_PROFILE, source: "example" };
  }
  throw new ProfileSelectionError(
    [`brand/ holds no profile: each one is a folder with a ${BRAND_FILE}.`],
    [{ change: "create your chapter's profile", run: "pnpm brand:init" }],
  );
}

/** Where a profile's 16 images are: brand/local/ itself, or any other profile's own assets/. */
const assetsDirOf = (slug: string, dir: string) =>
  slug === LOCAL_PROFILE ? dir : join(dir, "assets");

/** Which profile a command means: the one its caller names, else the tooling override, else brand/ (spec P1, P4). */
function selectedProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
  profile,
}: LoadProfileOptions = {}): Selection {
  if (profile) return { slug: profile, source: "named" };
  const override = env[PROFILE_OVERRIDE_ENV]?.trim();
  if (!override) return discoverProfile(repoRoot);
  const discovered = discoveredProfile(repoRoot);
  // An override that repeats the discovery changes nothing, so it is not one.
  if (discovered?.slug === override) return discovered;
  return { slug: override, source: "override", discovered: discovered?.slug ?? null };
}

/** brand/'s choice, or null when it has none (the override then explains itself). */
function discoveredProfile(repoRoot: string): ReturnType<typeof discoverProfile> | null {
  try {
    return discoverProfile(repoRoot);
  } catch (error) {
    if (error instanceof ProfileSelectionError) return null;
    throw error;
  }
}

function overrideWarning(slug: string, discovered: string | null | undefined): string {
  return `${PROFILE_OVERRIDE_ENV}=${slug} in your environment overrides the profile found in brand/${discovered ? ` ("${discovered}")` : ""}. If you did not mean that: unset ${PROFILE_OVERRIDE_ENV}   # in your shell`;
}

/**
 * Choose an existing profile where the bad one came from: the caller or the override.
 * `choices` lists the ones that exist.
 */
function selectProfileRemedy(choices: readonly string[], source: ExplicitSource): Remedy {
  const list = choices.join(", ") || "(none yet: run pnpm brand:init)";
  return source === "named"
    ? { change: `name one of: ${list}` }
    : {
        change: `set ${PROFILE_OVERRIDE_ENV} to one of: ${list}, or unset it to use the profile found in brand/`,
      };
}

export function loadProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
  profile,
}: LoadProfileOptions = {}): LoadedProfile {
  // Every command loads a profile first: none must take a leftover canary for the chapter.
  const recovered = recoverInterruptedCanary(repoRoot);
  if (recovered) console.error(`brand: ${recovered}`);
  const { slug, source, discovered } = selectedProfile({ repoRoot, env, profile });
  const warnings = source === "override" ? [overrideWarning(slug, discovered)] : [];

  const brandDir = join(repoRoot, "brand");
  const choices = () => availableProfiles(repoRoot);
  // Discovery checks its own folder names, so only an explicit choice can fail below.
  const select = (): Remedy[] =>
    isExplicitSource(source) ? [selectProfileRemedy(choices(), source)] : [];
  // Checked before the path join, so a slug like "../x" can never leave brand/.
  if (!SLUG_PATTERN.test(slug)) {
    throw new ProfileNotFoundError(
      [`profile "${slug}" ${SLUG_MESSAGE} (e.g. jci-valle)`],
      select(),
    );
  }
  const dir = join(brandDir, slug);
  const file = join(dir, BRAND_FILE);
  const label = brandFileLabel(slug);
  if (!existsSync(file)) {
    throw new ProfileNotFoundError(
      [`profile "${slug}" not found at ${label} (available: ${choices().join(", ") || "none"})`],
      [...select(), { change: "or create your chapter's brand", run: "pnpm brand:init" }],
    );
  }

  const own = readBrandToml(file, label);
  const resolved =
    slug === EXAMPLE_PROFILE
      ? resolveBrandFile({ slug, base: own, label, baseLabel: label })
      : resolveBrandFile({
          slug,
          chapter: own,
          base: readBase(repoRoot),
          label,
          baseLabel: BASE_LABEL,
        });
  const localOnly = isDemoProject(resolved.brand.firebase.projectId);
  const assetsDir = assetsDirOf(slug, dir);
  return { slug, dir, assetsDir, ...resolved, source, warnings, localOnly };
}

const BASE_LABEL = brandFileLabel(EXAMPLE_PROFILE);

/** The example's brand.toml, the base layer every chapter's builds on. */
export function readBase(repoRoot: string = REPO_ROOT): Table {
  const file = join(repoRoot, "brand", EXAMPLE_PROFILE, BRAND_FILE);
  if (!existsSync(file)) {
    throw new BrandConfigError(
      [`${BASE_LABEL}: missing; every chapter's ${BRAND_FILE} builds on it`],
      [{ change: "restore the example from git", run: `git checkout -- ${BASE_LABEL}` }],
    );
  }
  return readBrandToml(file, BASE_LABEL);
}
