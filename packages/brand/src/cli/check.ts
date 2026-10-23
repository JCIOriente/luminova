import { relative } from "node:path";
import { PULL_MANIFEST_FILE, validateAssets } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, type LoadedProfile } from "../load-profile.ts";
import { releaseErrors, selectAssetsDir } from "../release.ts";
import { SITE_CONTENT_FILE, readSiteContent } from "../site-content.ts";
import { runCli } from "./main.ts";
import { formatTable } from "./table.ts";

type Env = Readonly<Record<string, string | undefined>>;

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

/** Strips the `<path>: ` prefix the validator puts on each of a file's messages. */
function messagesFor(path: string, messages: readonly string[]): string[] {
  const prefix = `${path}: `;
  return messages
    .filter((message) => message.startsWith(prefix))
    .map((m) => m.slice(prefix.length));
}

/**
 * The site content the build would embed, validated with the build's schema. Loaded lazily:
 * the schema comes from @luminova/types, whose runtime entry is its built dist.
 */
export async function siteContentErrors(profile: LoadedProfile): Promise<string[]> {
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
}): Promise<{ assetsDir: string; rows: CheckRow[] }> {
  const assetsDir = selectAssetsDir(repoRoot, profile, env, release);
  const validation = validateAssets(assetsDir, { profile: profile.slug });

  const rows: CheckRow[] = validation.files.map(({ path, expected, found }) => {
    const errors = messagesFor(path, validation.errors);
    const warnings = messagesFor(path, validation.warnings);
    const verdict =
      errors.join("; ") || (warnings.length > 0 ? `warn: ${warnings.join("; ")}` : "ok");
    return { item: path, expected, found, verdict, failed: errors.length > 0 };
  });
  rows.push(
    ...messagesFor(PULL_MANIFEST_FILE, validation.errors).map((message) =>
      failure(PULL_MANIFEST_FILE, message),
    ),
  );

  const contentErrors = await siteContentErrors(profile);
  rows.push(
    contentErrors.length > 0
      ? failure(SITE_CONTENT_FILE, contentErrors.join("; "))
      : {
          item: SITE_CONTENT_FILE,
          expected: "schema",
          found: "valid",
          verdict: "ok",
          failed: false,
        },
  );

  if (release) {
    const rules = releaseErrors({
      profile,
      env,
      assetsDir,
      command: "build",
      emulatorEnabled: false,
    });
    rows.push(...rules.map((message) => failure("release", message)));
  }
  return { assetsDir, rows };
}

if (import.meta.main) {
  const release = process.argv.slice(2).includes("--release");
  await runCli("brand:check", async (profile) => {
    const { assetsDir, rows } = await checkBrand({ profile, release });
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
      console.error(`brand:check: ${failed} problem${failed === 1 ? "" : "s"}.`);
      process.exit(1);
    }
    console.log("brand:check: ok.");
  });
}
