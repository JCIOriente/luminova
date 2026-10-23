import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SLUG_MESSAGE, SLUG_PATTERN, brandSchema, type Brand } from "./schema.ts";

export const DEFAULT_PROFILE = "jci-oriente";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export class BrandConfigError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Brand profile error:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
    this.name = "BrandConfigError";
    this.errors = errors;
  }
}

/** A profile that cannot be located: a malformed slug or no `brand/<slug>/brand.json`. */
export class ProfileNotFoundError extends BrandConfigError {
  constructor(errors: string[]) {
    super(errors);
    this.name = "ProfileNotFoundError";
  }
}

export type Env = Readonly<Record<string, string | undefined>>;

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Parses JSON text; `label` prefixes the error, e.g. `brand/acme/brand.json`. */
export function parseJsonText(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new BrandConfigError([`${label}: not valid JSON (${errorMessage(error)})`]);
  }
}

export function readJsonFile(file: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new BrandConfigError([`${label}: cannot read (${errorMessage(error)})`]);
  }
  return parseJsonText(text, label);
}

/** One error line per schema issue, `<label> <path>: <message>`. */
export function issuesToBrandError(
  label: string,
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): BrandConfigError {
  return new BrandConfigError(
    issues.map(
      (issue) => `${label} ${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
    ),
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
      ? [`BRAND_PROFILE is unset; using the "${DEFAULT_PROFILE}" example profile.`]
      : [];

  // Checked before the path join, so a slug like "../x" can never leave brand/.
  if (!SLUG_PATTERN.test(slug)) {
    throw new ProfileNotFoundError([`profile "${slug}" ${SLUG_MESSAGE} (e.g. jci-oriente)`]);
  }
  const brandDir = join(repoRoot, "brand");
  const dir = join(brandDir, slug);
  const file = join(dir, "brand.json");
  if (!existsSync(file)) {
    const available = availableProfiles(brandDir).join(", ") || "none";
    throw new ProfileNotFoundError([
      `profile "${slug}" not found at brand/${slug}/brand.json (available: ${available})`,
    ]);
  }

  const label = `brand/${slug}/brand.json`;
  const parsed = brandSchema.safeParse(readJsonFile(file, label));
  if (!parsed.success) throw issuesToBrandError(label, parsed.error.issues);
  if (parsed.data.slug !== slug) {
    throw new BrandConfigError([
      `brand/${slug}/brand.json: slug "${parsed.data.slug}" must equal its folder "${slug}"`,
    ]);
  }

  return { slug, dir, brand: parsed.data, source, warnings };
}
