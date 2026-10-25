import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE, luminovaConfigSchema, type LuminovaConfig } from "./config.ts";
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

/** luminova.json is missing or invalid: it names the profile, so nothing else can load. */
export class ConfigFileError extends BrandConfigError {
  override name = "ConfigFileError";
}

/** `luminova.json`, validated; every failure names the file and how to fix it. */
export function readLuminovaConfig(repoRoot: string): LuminovaConfig {
  const file = join(repoRoot, CONFIG_FILE);
  if (!existsSync(file)) {
    throw new ConfigFileError(
      [`${CONFIG_FILE} is missing: it names the chapter (brand/<slug>/) this repository builds.`],
      [
        {
          change: `create your chapter's profile with brand:init (it writes ${CONFIG_FILE} too)`,
          run: "pnpm brand:init",
        },
        {
          change: `or create ${CONFIG_FILE} at the repo root for an existing profile: { "profile": "<slug>" }`,
        },
      ],
    );
  }
  const fix: Remedy = {
    change: `fix ${CONFIG_FILE}: it holds one field, "profile", a folder name under brand/ (e.g. "jci-valle")`,
  };
  let json: unknown;
  try {
    json = readJsonFile(file, CONFIG_FILE);
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    throw new ConfigFileError(error.errors, error.remedies);
  }
  const parsed = luminovaConfigSchema.safeParse(json);
  if (!parsed.success) {
    const { errors, remedies } = issuesToBrandError(CONFIG_FILE, parsed.error.issues, [fix]);
    throw new ConfigFileError(errors, remedies);
  }
  return parsed.data;
}

export type ProfileSource = "flag" | "override" | "file";

export interface LoadedProfile {
  slug: string;
  dir: string;
  brand: Brand;
  source: ProfileSource;
  warnings: string[];
}

interface Selection {
  slug: string;
  source: ProfileSource;
  /** What luminova.json names, read at most once; null when an override met a missing or broken file. */
  configured?: string | null;
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
  file: `from ${CONFIG_FILE}`,
};

export const REMOVE_OVERRIDE: Remedy = {
  change: `remove ${PROFILE_OVERRIDE_ENV} from your environment, and its export line from your shell startup file if you added one`,
  run: `unset ${PROFILE_OVERRIDE_ENV}`,
  where: "shell",
};

/**
 * Which profile a command means: `--profile`, else the tooling override, else
 * `luminova.json` (spec C1, C5).
 */
function selectedProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
  profile,
}: LoadProfileOptions = {}): Selection {
  if (profile) return { slug: profile, source: "flag" };
  const override = env[PROFILE_OVERRIDE_ENV]?.trim();
  if (!override) {
    const configured = readLuminovaConfig(repoRoot).profile;
    return { slug: configured, source: "file", configured };
  }
  const configured = configuredProfile(repoRoot);
  // An override that repeats the file changes nothing, so it is not one.
  return { slug: override, source: configured === override ? "file" : "override", configured };
}

/** The file's profile, or null when it is missing or broken (the override then explains itself). */
function configuredProfile(repoRoot: string): string | null {
  try {
    return readLuminovaConfig(repoRoot).profile;
  } catch (error) {
    if (error instanceof BrandConfigError) return null;
    throw error;
  }
}

function overrideWarning(slug: string, configured: string | null | undefined): string {
  return `${PROFILE_OVERRIDE_ENV}=${slug} in your environment overrides ${CONFIG_FILE}${configured ? ` ("${configured}")` : ""}. If you did not mean that: unset ${PROFILE_OVERRIDE_ENV}   # in your shell`;
}

/**
 * Choose an existing profile where the bad one came from: the `--profile` flag, or
 * luminova.json. `choices` lists the ones that exist.
 */
export function selectProfileRemedy(
  choices?: readonly string[],
  source: ProfileSource = "file",
): Remedy {
  const list = choices && (choices.join(", ") || "(none yet: run pnpm brand:init)");
  if (source === "flag") return { change: `pass --profile one of: ${list ?? "your profiles"}` };
  return {
    change: list
      ? `set "profile" in ${CONFIG_FILE} to one of: ${list}`
      : `set "profile" in ${CONFIG_FILE} to your chapter's folder under brand/`,
  };
}

/** Profiles a person would select: every one with a brand.json except the neutral fixture. */
function selectableProfiles(repoRoot: string = REPO_ROOT): string[] {
  return availableProfiles(join(repoRoot, "brand")).filter((slug) => slug !== NEUTRAL_PROFILE);
}

function availableProfiles(brandDir: string): string[] {
  if (!existsSync(brandDir)) return [];
  return readdirSync(brandDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(brandDir, entry.name, "brand.json")))
    .map((entry) => entry.name)
    .sort();
}

export function loadProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
  profile,
}: LoadProfileOptions = {}): LoadedProfile {
  const { slug, source, configured } = selectedProfile({ repoRoot, env, profile });
  const warnings = source === "override" ? [overrideWarning(slug, configured)] : [];

  const brandDir = join(repoRoot, "brand");
  // Only the error paths need the list, so a build never pays for the directory scan.
  const choices = () => selectableProfiles(repoRoot);
  const select = () => selectProfileRemedy(choices(), source);
  // Checked before the path join, so a slug like "../x" can never leave brand/.
  if (!SLUG_PATTERN.test(slug)) {
    throw new ProfileNotFoundError(
      [`profile "${slug}" ${SLUG_MESSAGE} (e.g. jci-oriente)`],
      [select()],
    );
  }
  const dir = join(brandDir, slug);
  const file = join(dir, "brand.json");
  if (!existsSync(file)) {
    throw new ProfileNotFoundError(
      [
        `profile "${slug}" not found at brand/${slug}/brand.json (available: ${choices().join(", ") || "none"})`,
      ],
      [select(), { change: `or create brand/${slug}/`, run: "pnpm brand:init" }],
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

  return { slug, dir, brand: parsed.data, source, warnings };
}
