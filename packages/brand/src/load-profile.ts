import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandSchema, type Brand } from "./schema.ts";

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

/** Parses a profile JSON file; `label` prefixes the error, e.g. `brand/acme/brand.json`. */
export function readJsonFile(file: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new BrandConfigError([
      `${label}: not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    ]);
  }
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
  env?: Readonly<Record<string, string | undefined>>;
  profile?: string;
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
  const fromEnv = env.BRAND_PROFILE?.trim();
  const slug = profile ?? (fromEnv || DEFAULT_PROFILE);
  const source = profile ? "argument" : fromEnv ? "env" : "default";
  const warnings =
    source === "default"
      ? [`BRAND_PROFILE is unset; using the "${DEFAULT_PROFILE}" example profile.`]
      : [];

  const brandDir = join(repoRoot, "brand");
  const dir = join(brandDir, slug);
  const file = join(dir, "brand.json");
  if (!existsSync(file)) {
    const available = availableProfiles(brandDir).join(", ") || "none";
    throw new BrandConfigError([
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
