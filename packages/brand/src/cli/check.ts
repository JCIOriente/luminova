import { relative } from "node:path";
import { PULL_MANIFEST_FILE, validateAssets } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, type Env, type LoadedProfile } from "../load-profile.ts";
import { releaseErrors, selectAssetsDir } from "../release.ts";
import { SITE_CONTENT_FILE, readSiteContent } from "../site-content.ts";
import { runCli } from "./main.ts";
import { formatTable, plural } from "./table.ts";

export interface CheckRow {
  item: string;
  expected: string;
  found: string;
  verdict: string;
  failed: boolean;
}

const failure = (item: string, verdict: string): CheckRow => ({
  item,
  expected: "",
  found: "",
  verdict,
  failed: true,
});

/**
 * The site content the build would embed, validated with the build's schema. Loaded lazily:
 * the schema comes from @luminova/types, whose runtime entry is its built dist.
 */
async function siteContentErrors(profile: LoadedProfile): Promise<string[]> {
  try {
    const raw = readSiteContent(profile.dir, profile.slug);
    const { parseSiteContent } = await import("../site-content-schema.ts");
    parseSiteContent(raw, profile.slug);
    return [];
  } catch (error) {
    if (error instanceof BrandConfigError) return error.errors;
    if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") {
      return [
        `cannot load the site-content schema (${error.message}); run pnpm turbo run build --filter=@luminova/types`,
      ];
    }
    throw error;
  }
}

export interface BrandCheck {
  assetsDir: string;
  /** One row per contract file, then the pull manifest's when it fails. */
  assets: CheckRow[];
  content: CheckRow;
  release: CheckRow[];
}

/** Every row in table order. */
export const checkRows = ({ assets, content, release }: BrandCheck): CheckRow[] => [
  ...assets,
  content,
  ...release,
];

/** The build's own checks, one row per contract file (spec section 5.9). */
export async function checkBrand({
  profile,
  repoRoot = REPO_ROOT,
  env = process.env,
  release = false,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  env?: Env;
  release?: boolean;
}): Promise<BrandCheck> {
  const assetsDir = selectAssetsDir(repoRoot, profile, env, release);
  const validation = validateAssets(assetsDir, { profile: profile.slug });

  const assets: CheckRow[] = validation.files.map(
    ({ path, expected, found, errors, warnings }) => ({
      item: path,
      expected,
      found,
      verdict: errors.join("; ") || (warnings.length > 0 ? `warn: ${warnings.join("; ")}` : "ok"),
      failed: errors.length > 0,
    }),
  );
  if (validation.manifestError) {
    assets.push(failure(PULL_MANIFEST_FILE, validation.manifestError));
  }

  const contentErrors = await siteContentErrors(profile);
  const content: CheckRow =
    contentErrors.length > 0
      ? failure(SITE_CONTENT_FILE, contentErrors.join("; "))
      : {
          item: SITE_CONTENT_FILE,
          expected: "schema",
          found: "valid",
          verdict: "ok",
          failed: false,
        };

  const rules = release
    ? releaseErrors({ profile, env, assetsDir, command: "build", emulatorEnabled: false })
    : [];
  return {
    assetsDir,
    assets,
    content,
    release: rules.map((message) => failure("release", message)),
  };
}

if (import.meta.main) {
  const release = process.argv.slice(2).includes("--release");
  await runCli("brand:check", async (profile) => {
    const result = await checkBrand({ profile, release });
    const { assetsDir } = result;
    const rows = checkRows(result);
    console.log(
      `brand:check: profile "${profile.slug}" (${profile.source}), assets in ${relative(REPO_ROOT, assetsDir) || "."}/${release ? ", release rules" : ""}`,
    );
    console.log(
      formatTable([
        ["FILE", "EXPECTED", "FOUND", "VERDICT"],
        ...rows.map(({ item, expected, found, verdict }) => [item, expected, found, verdict]),
      ]),
    );
    const failed = rows.filter((row) => row.failed).length;
    if (failed > 0) {
      console.error(`brand:check: ${plural(failed, "problem")}.`);
      process.exit(1);
    }
    console.log("brand:check: ok.");
  });
}
