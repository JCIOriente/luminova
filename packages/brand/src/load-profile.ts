import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatRemedies, uniqueRemedies, type Problem, type Remedy } from "./remedy.ts";
import { SLUG_MESSAGE, SLUG_PATTERN, brandSchema, type Brand } from "./schema.ts";

export const DEFAULT_PROFILE = "jci-oriente";

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

/** One error line per schema issue, `<label> <path>: <message>`. */
export function issuesToBrandError(
  label: string,
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  remedies: readonly Remedy[] = [],
): BrandConfigError {
  return new BrandConfigError(
    issues.map(
      (issue) => `${label} ${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
    ),
    remedies,
  );
}

export interface LoadedProfile {
  slug: string;
  dir: string;
  brand: Brand;
  source: "argument" | "env" | "default";
  warnings: string[];
}

export interface LoadProfileOptions {
  repoRoot?: string;
  env?: Env;
  profile?: string;
}

/** Which profile a command means: an explicit one, else BRAND_PROFILE, else the example. */
export function selectedProfile({
  env = process.env,
  profile,
}: Pick<LoadProfileOptions, "env" | "profile"> = {}): {
  slug: string;
  source: LoadedProfile["source"];
} {
  const fromEnv = env.BRAND_PROFILE?.trim();
  if (profile) return { slug: profile, source: "argument" };
  return fromEnv ? { slug: fromEnv, source: "env" } : { slug: DEFAULT_PROFILE, source: "default" };
}

/**
 * The command that keeps BRAND_PROFILE set in every new terminal, for the user's shell. The
 * selection is an environment variable on purpose (spec D18), so it lives in the shell's
 * startup file (or a direnv `.envrc`), never in a repo file.
 */
export function keepProfileCommand(slug: string, env: Env = process.env): string {
  const shell = basename(env.SHELL ?? "");
  if (shell === "fish") return `set -Ux BRAND_PROFILE ${slug}`;
  const startupFile = { zsh: "~/.zshrc", bash: "~/.bashrc" }[shell];
  return startupFile
    ? `echo 'export BRAND_PROFILE=${slug}' >> ${startupFile}`
    : `add export BRAND_PROFILE=${slug} to your shell's startup file`;
}

export const cdProfileCommand = (slug: string) =>
  `gh variable set BRAND_PROFILE --env production --body ${slug}`;

/** Select a profile in this terminal; `choices` lists the ones that exist. */
export const selectProfileRemedy = (choices?: readonly string[]): Remedy => ({
  change: choices
    ? `select an existing profile (${choices.join(", ") || "none yet"})`
    : "select your own profile",
  run: "export BRAND_PROFILE=<slug>",
  where: "shell",
});

/**
 * The steps that select `slug` for good: every new terminal, this one, and (with `cd`) the
 * GitHub production variable CD reads.
 */
export function profileSetupRemedies(
  slug: string,
  { env = process.env, cd = true }: { env?: Env; cd?: boolean } = {},
): Remedy[] {
  const steps: Remedy[] = [
    {
      change: "select it in every new terminal (or put the export in a direnv .envrc in the repo)",
      run: keepProfileCommand(slug, env),
      where: "shell",
    },
    { change: "and in this one", run: `export BRAND_PROFILE=${slug}`, where: "shell" },
  ];
  if (cd)
    steps.push({ change: "CD reads its own copy", run: cdProfileCommand(slug), where: "shell" });
  return steps;
}

/** Profiles a person would select: every one with a brand.json except the neutral fixture. */
export function selectableProfiles(repoRoot: string = REPO_ROOT): string[] {
  return availableProfiles(join(repoRoot, "brand")).filter((slug) => slug !== "fixture");
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
  const { slug, source } = selectedProfile({ env, profile });
  const warnings =
    source === "default"
      ? [
          `BRAND_PROFILE is unset; using the "${DEFAULT_PROFILE}" example profile. To keep yours: ${keepProfileCommand("<slug>", env)}`,
        ]
      : [];

  const brandDir = join(repoRoot, "brand");
  const select = () => selectProfileRemedy(selectableProfiles(repoRoot));
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
        `profile "${slug}" not found at brand/${slug}/brand.json (available: ${availableProfiles(brandDir).join(", ") || "none"})`,
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
