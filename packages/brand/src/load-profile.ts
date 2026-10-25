import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatRemedies, uniqueRemedies, type Problem, type Remedy } from "./remedy.ts";
import { SLUG_MESSAGE, SLUG_PATTERN, brandSchema, type Brand } from "./schema.ts";

/** The chapter-neutral test profile `brand:guard` builds; it can never ship. */
export const NEUTRAL_PROFILE = "fixture";

/** The committed example chapter; `brand:init` copies its site content. */
export const EXAMPLE_PROFILE = "jci-oriente";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Every problem at once, then what to do about them. The message carries the "To fix:"
 * block, so any caller that prints it (a CLI, Vite during `pnpm dev`) shows the remedies.
 */
export class BrandConfigError extends Error {
  readonly errors: string[];
  readonly remedies: Remedy[];

  constructor(problems: readonly (string | Problem)[], remedies: readonly Remedy[] = []) {
    const errors = problems.map((problem) =>
      typeof problem === "string" ? problem : problem.message,
    );
    const all = uniqueRemedies([
      ...problems.flatMap((problem) =>
        typeof problem === "string" ? [] : (problem.remedies ?? []),
      ),
      ...remedies,
    ]);
    const fix = formatRemedies(all);
    super(
      `Brand profile error:\n${errors.map((error) => `  - ${error}`).join("\n")}${fix ? `\n${fix}` : ""}`,
    );
    this.name = "BrandConfigError";
    this.errors = errors;
    this.remedies = all;
  }
}

/** A profile that cannot be located: a malformed slug or no `brand/<slug>/brand.json`. */
export class ProfileNotFoundError extends BrandConfigError {
  override name = "ProfileNotFoundError";
}

export type Env = Readonly<Record<string, string | undefined>>;

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Parses JSON text; `label` prefixes the error, e.g. `brand/acme/brand.json`. */
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

interface SchemaIssue {
  path: readonly PropertyKey[];
  message: string;
  code?: string;
  keys?: readonly string[];
  input?: unknown;
}

/** zod's wording for the two issues a hand-edited file hits most, in plain words. */
function describeIssue({ code, keys, input, message }: SchemaIssue): string {
  if (code === "unrecognized_keys" && keys) {
    return `unknown field ${keys.map((key) => `"${key}"`).join(", ")} (a typo?)`;
  }
  if (code === "invalid_type" && input === undefined) return "missing";
  return message;
}

/** One error line per schema issue, `<label> <path>: <message>`. */
export function issuesToBrandError(
  label: string,
  issues: readonly SchemaIssue[],
  remedies: readonly Remedy[] = [],
): BrandConfigError {
  return new BrandConfigError(
    issues.map(
      (issue) =>
        `${label} ${issue.path.map(String).join(".") || "(root)"}: ${describeIssue(issue)}`,
    ),
    remedies,
  );
}

/**
 * Where a command's profile came from: `--profile`, the tooling override, or brand/
 * itself (its one chapter profile, else the example; spec P1).
 */
export type ProfileSource = ExplicitSource | DiscoveredSource;
/** Chosen by hand, for one command. */
export type ExplicitSource = "flag" | "override";
/** Chosen by what brand/ holds. */
export type DiscoveredSource = "chapter" | "example";

export const isExplicitSource = (source: ProfileSource): source is ExplicitSource =>
  source === "flag" || source === "override";

export interface LoadedProfile {
  slug: string;
  dir: string;
  brand: Brand;
  source: ProfileSource;
  warnings: string[];
  /**
   * The profile runs only in the emulators: a `demo-` project, from `brand:init --local`,
   * until `brand:init --connect` attaches a real one.
   */
  localOnly: boolean;
}

const DEMO_PROJECT_PREFIX = "demo-";

/** A `demo-` project exists only in the Firebase emulators. */
export const isDemoProject = (projectId: string) => projectId.startsWith(DEMO_PROJECT_PREFIX);

/** The emulator-only project a local profile runs on, kept within Firebase's 30 characters. */
export const demoProjectId = (slug: string) =>
  `${DEMO_PROJECT_PREFIX}${slug}`.slice(0, 30).replace(/-+$/, "");

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

/** Tools set it for a single build (brand:guard's neutral build); a person never needs to. */
export const PROFILE_OVERRIDE_ENV = "BRAND_PROFILE";

/** How a command tells the user where its profile came from. */
export const SOURCE_LABEL: Readonly<Record<ProfileSource, string>> = {
  flag: "from --profile",
  override: `from ${PROFILE_OVERRIDE_ENV}`,
  chapter: "the chapter profile in brand/",
  example: "the example: no chapter profile in brand/ yet",
};

export const REMOVE_OVERRIDE: Remedy = {
  change: `remove ${PROFILE_OVERRIDE_ENV} from your environment, and its export line from your shell startup file if you added one`,
  run: `unset ${PROFILE_OVERRIDE_ENV}`,
  where: "shell",
};

/** brand/ has no single profile to select: none, two chapter profiles, or a misnamed folder. */
export class ProfileSelectionError extends BrandConfigError {
  override name = "ProfileSelectionError";
}

/** Profile folders (each with a brand.json), sorted. */
function availableProfiles(repoRoot: string): string[] {
  const brandDir = join(repoRoot, "brand");
  if (!existsSync(brandDir)) return [];
  return readdirSync(brandDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(brandDir, entry.name, "brand.json")))
    .map((entry) => entry.name)
    .sort();
}

/** Profiles a person would select: every one except the neutral fixture. */
const selectableProfiles = (repoRoot: string) =>
  availableProfiles(repoRoot).filter((slug) => slug !== NEUTRAL_PROFILE);

const notExample = (slug: string) => slug !== EXAMPLE_PROFILE;

/** Every profile folder except the example and the neutral fixture. */
export const chapterProfiles = (repoRoot: string = REPO_ROOT) =>
  selectableProfiles(repoRoot).filter(notExample);

/**
 * What brand/ selects (spec P1): its one chapter profile, else the example. Twin:
 * .github/scripts/deploy-ready.sh applies the same rule before Deploy installs anything.
 */
export function discoverProfile(repoRoot: string = REPO_ROOT): {
  slug: string;
  source: DiscoveredSource;
} {
  const profiles = selectableProfiles(repoRoot);
  const chapters = profiles.filter(notExample);
  const [only] = chapters;
  if (chapters.length > 1) {
    throw new ProfileSelectionError(
      [
        `brand/ holds ${chapters.length} chapter profiles (${chapters.join(", ")}); a repository builds one.`,
      ],
      [
        {
          change: "delete the folder under brand/ you do not build, so one chapter profile remains",
        },
        { change: `or pass --profile one of: ${chapters.join(", ")}, for one command` },
      ],
    );
  }
  if (only !== undefined && !SLUG_PATTERN.test(only)) {
    throw new ProfileSelectionError(
      [`brand/${only}/: a profile folder name ${SLUG_MESSAGE} (e.g. jci-valle)`],
      [
        {
          change: `rename brand/${only}/ to lowercase letters, digits and hyphens, and set "slug" in its brand.json to match`,
        },
      ],
    );
  }
  if (only !== undefined) return { slug: only, source: "chapter" };
  if (profiles.includes(EXAMPLE_PROFILE)) return { slug: EXAMPLE_PROFILE, source: "example" };
  throw new ProfileSelectionError(
    ["brand/ holds no profile: each one is a folder with a brand.json."],
    [{ change: "create your chapter's profile", run: "pnpm brand:init" }],
  );
}

/** Which profile a command means: `--profile`, else the tooling override, else brand/ (spec P1, P4). */
function selectedProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
  profile,
}: LoadProfileOptions = {}): Selection {
  if (profile) return { slug: profile, source: "flag" };
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
 * Choose an existing profile where the bad one came from: the `--profile` flag or the
 * override. `choices` lists the ones that exist.
 */
function selectProfileRemedy(choices: readonly string[], source: ExplicitSource): Remedy {
  const list = choices.join(", ") || "(none yet: run pnpm brand:init)";
  return source === "flag"
    ? { change: `pass --profile one of: ${list}` }
    : {
        change: `set ${PROFILE_OVERRIDE_ENV} to one of: ${list}, or unset it to use the profile found in brand/`,
      };
}

export function loadProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
  profile,
}: LoadProfileOptions = {}): LoadedProfile {
  const { slug, source, discovered } = selectedProfile({ repoRoot, env, profile });
  const warnings = source === "override" ? [overrideWarning(slug, discovered)] : [];

  const brandDir = join(repoRoot, "brand");
  const choices = () => selectableProfiles(repoRoot);
  // Discovery checks its own folder names, so only an explicit choice can fail below.
  const select = (): Remedy[] =>
    isExplicitSource(source) ? [selectProfileRemedy(choices(), source)] : [];
  // Checked before the path join, so a slug like "../x" can never leave brand/.
  if (!SLUG_PATTERN.test(slug)) {
    throw new ProfileNotFoundError(
      [`profile "${slug}" ${SLUG_MESSAGE} (e.g. jci-oriente)`],
      select(),
    );
  }
  const dir = join(brandDir, slug);
  const file = join(dir, "brand.json");
  if (!existsSync(file)) {
    throw new ProfileNotFoundError(
      [
        `profile "${slug}" not found at brand/${slug}/brand.json (available: ${choices().join(", ") || "none"})`,
      ],
      [...select(), { change: `or create brand/${slug}/`, run: "pnpm brand:init" }],
    );
  }

  const label = `brand/${slug}/brand.json`;
  const parsed = brandSchema.safeParse(readJsonFile(file, label));
  if (!parsed.success) {
    throw issuesToBrandError(label, parsed.error.issues, [
      {
        change: `edit the fields above in ${label} (brand/brand.schema.json describes each)`,
        run: "pnpm brand:check",
      },
    ]);
  }
  if (parsed.data.slug !== slug) {
    throw new BrandConfigError(
      [`${label}: slug "${parsed.data.slug}" must equal its folder "${slug}"`],
      [{ change: `set "slug" to "${slug}" in ${label}, or rename the folder` }],
    );
  }

  const localOnly = isDemoProject(parsed.data.firebase.projectId);
  return { slug, dir, brand: parsed.data, source, warnings, localOnly };
}
