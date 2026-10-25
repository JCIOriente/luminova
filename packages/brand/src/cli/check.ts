import { flagValue } from "../argv.ts";
import { PULL_ASSETS, PULL_MANIFEST_FILE, assetRemedies, validateAssets } from "../assets.ts";
import {
  BrandConfigError,
  REPO_ROOT,
  SOURCE_LABEL,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { displayDir, releaseErrors, selectAssetsDir } from "../release.ts";
import { formatNext, formatRemedies, type Problem, type Remedy } from "../remedy.ts";
import { SITE_CONTENT_FILE, readSiteContent } from "../site-content.ts";
import { runCli } from "./main.ts";
import { formatTable, plural } from "./table.ts";

export interface CheckRow {
  item: string;
  expected: string;
  found: string;
  verdict: string;
  failed: boolean;
  remedies?: readonly Remedy[];
}

const failure = (item: string, { message, remedies }: Problem): CheckRow => ({
  item,
  expected: "",
  found: "",
  verdict: message,
  failed: true,
  remedies,
});

/**
 * The site content the build would embed, validated with the build's schema. Loaded lazily:
 * the schema comes from @luminova/types, whose runtime entry is its built dist.
 */
async function siteContentProblem(profile: LoadedProfile): Promise<Problem | null> {
  try {
    const raw = readSiteContent(profile.dir, profile.slug);
    const { parseSiteContent } = await import("../site-content-schema.ts");
    parseSiteContent(raw, profile.slug);
    return null;
  } catch (error) {
    if (error instanceof BrandConfigError) {
      return { message: error.errors.join("; "), remedies: error.remedies };
    }
    if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") {
      return {
        message: `cannot load the site-content schema (${error.message})`,
        remedies: [{ run: "pnpm turbo run build --filter=@luminova/types" }],
      };
    }
    throw error;
  }
}

export interface BrandCheck {
  assetsDir: string;
  /** One row per contract file, then the pull manifest's when it fails. */
  assets: CheckRow[];
  /** What to do about the asset rows, one remedy per kind of problem. */
  assetRemedies: Remedy[];
  content: CheckRow;
  release: CheckRow[];
}

/** Every row in table order. */
export const checkRows = ({ assets, content, release }: BrandCheck): CheckRow[] => [
  ...assets,
  content,
  ...release,
];

/** Every remedy, in table order. */
export const checkRemedies = (check: BrandCheck): Remedy[] => [
  ...check.assetRemedies,
  ...(check.content.remedies ?? []),
  ...check.release.flatMap((row) => row.remedies ?? []),
];

/** The table already has an EXPECTED column, so a verdict need not repeat it. */
const tableVerdict = (error: string) =>
  error.replace(/ \(expected [^)]*\)$/, "").replace(/^\d+×\d+, expected .*$/, "wrong size");

export const CHECK_NEXT: readonly Remedy[] = [
  { change: "check the whole setup", run: "pnpm brand:doctor" },
];

/** The build's own checks, one row per contract file (spec section 5.9). */
export async function checkBrand({
  profile,
  repoRoot = REPO_ROOT,
  env = process.env,
  release = false,
  assets: chosenAssets,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  env?: Env;
  release?: boolean;
  /** `--assets <dir>`: check another folder, e.g. the one `brand:push --from` reads. */
  assets?: string;
}): Promise<BrandCheck> {
  const assetsDir = selectAssetsDir(repoRoot, profile, env, release, chosenAssets);
  const validation = validateAssets(assetsDir, { profile: profile.slug });

  const assets: CheckRow[] = validation.files.map(
    ({ path, expected, found, errors, warnings }) => ({
      item: path,
      expected,
      found,
      verdict:
        errors.map(tableVerdict).join("; ") ||
        (warnings.length > 0 ? `warn: ${warnings.join("; ")}` : "ok"),
      failed: errors.length > 0,
    }),
  );
  if (validation.manifestError) {
    assets.push(failure(PULL_MANIFEST_FILE, { message: validation.manifestError }));
  }

  const contentProblem = await siteContentProblem(profile);
  const content: CheckRow = contentProblem
    ? failure(SITE_CONTENT_FILE, contentProblem)
    : { item: SITE_CONTENT_FILE, expected: "schema", found: "valid", verdict: "ok", failed: false };

  const rules = release
    ? releaseErrors({ profile, env, assetsDir, command: "build", emulatorEnabled: false })
    : [];
  return {
    assetsDir,
    assets,
    // A deploy only uses images downloaded with brand:pull, so that is the one fix there.
    assetRemedies: release
      ? validation.errors.length > 0
        ? [PULL_ASSETS]
        : []
      : assetRemedies(validation, displayDir(repoRoot, assetsDir)),
    content,
    release: rules.map((problem) => failure("deploy", problem)),
  };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const release = argv.includes("--release");
  await runCli("brand:check", async (profile) => {
    const assets = flagValue(argv, "--assets", (message) => new BrandConfigError([message]));
    if (release && assets) {
      throw new BrandConfigError(
        ["--assets and --release cannot be combined: release builds read only brand-assets/."],
        [
          {
            change: "drop --assets to check what a deploy would ship",
            run: "pnpm brand:check --release",
          },
        ],
      );
    }
    const result = await checkBrand({ profile, release, assets });
    const { assetsDir } = result;
    const rows = checkRows(result);
    console.log(
      `brand:check: profile "${profile.slug}" (${SOURCE_LABEL[profile.source]}), assets in ${displayDir(REPO_ROOT, assetsDir)}/${release ? ", as a deploy would see it (--release)" : ""}`,
    );
    console.log(
      formatTable([
        ["FILE", "EXPECTED", "FOUND", "VERDICT"],
        ...rows.map(({ item, expected, found, verdict }) => [item, expected, found, verdict]),
      ]),
    );
    const fix = formatRemedies(checkRemedies(result));
    if (fix) console.log(`\n${fix}`);
    const failed = rows.filter((row) => row.failed).length;
    if (failed > 0) {
      console.error(`brand:check: ${plural(failed, "problem")}.`);
      process.exit(1);
    }
    console.log(`brand:check: ok.\n\n${formatNext(CHECK_NEXT)}`);
  });
}
