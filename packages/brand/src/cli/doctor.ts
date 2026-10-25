import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT } from "../assets.ts";
import { CONFIG_FILE } from "../config.ts";
import {
  BrandConfigError,
  ConfigFileError,
  PROFILE_OVERRIDE_ENV,
  ProfileNotFoundError,
  REMOVE_OVERRIDE,
  REPO_ROOT,
  SOURCE_LABEL,
  errorMessage,
  loadProfile,
  readJsonFile,
  readLuminovaConfig,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { FIREBASERC, firebasercContent } from "./apply.ts";
import { checkBrand } from "./check.ts";
import { formatNext, formatRemedies, uniqueRemedies, type Remedy } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { cliFlag, exitOnFailure } from "./main.ts";
import { deployDispatch } from "./push.ts";
import {
  CONNECT_PROJECT,
  PRINT_GCP_SETUP,
  isDemoProject,
  missingDeployProblem,
} from "../release.ts";
import { formatTable, plural } from "./table.ts";

export interface DoctorRow {
  check: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
  remedies?: readonly Remedy[];
}

const row =
  (status: DoctorRow["status"]) =>
  (check: string, detail: string, remedies?: readonly Remedy[]): DoctorRow => ({
    check,
    status,
    detail,
    remedies,
  });
const ok = row("ok");
const warn = row("warn");
const fail = row("fail");
const skip = (check: string, detail = "needs a valid profile") => row("skip")(check, detail);

/** A caught error as a row: its message in the cell (never a "To fix:" block), its remedies. */
function failed(check: string, error: unknown): DoctorRow {
  if (error instanceof BrandConfigError)
    return fail(check, error.errors.join("; "), error.remedies);
  if (error instanceof CommandError) return fail(check, error.message, error.remedies);
  return fail(check, errorMessage(error));
}

async function attempt(check: string, body: () => Promise<DoctorRow>): Promise<DoctorRow> {
  try {
    return await body();
  } catch (error) {
    return failed(check, error);
  }
}

function profileRows(
  repoRoot: string,
  env: Env,
  flag?: string,
): { rows: DoctorRow[]; profile?: LoadedProfile } {
  let profile: LoadedProfile;
  try {
    profile = loadProfile({ repoRoot, env, profile: flag });
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    const detail = error.errors.join("; ");
    // A missing or broken luminova.json is its own row; it says how to fix it.
    if (error instanceof ConfigFileError) {
      return { rows: [skip("profile", `needs ${CONFIG_FILE}`), skip("brand.json")] };
    }
    if (error instanceof ProfileNotFoundError) {
      return { rows: [fail("profile", detail, error.remedies), skip("brand.json")] };
    }
    return { rows: [ok("profile", "found"), fail("brand.json", detail, error.remedies)] };
  }
  const { slug, source } = profile;
  return {
    rows: [
      ok("profile", `brand/${slug}/${source === "file" ? "" : ` (${SOURCE_LABEL[source]})`}`),
      ok("brand.json", "valid"),
    ],
    profile,
  };
}

async function brandRows(profile: LoadedProfile, repoRoot: string, env: Env): Promise<DoctorRow[]> {
  const { assets, content } = await checkBrand({ profile, repoRoot, env });
  const assetsFailed = assets.filter(({ failed }) => failed).length;
  const total = ASSET_CONTRACT.length;
  const contentFile = `brand/${profile.slug}/site-content.json`;
  return [
    content.failed
      ? fail("site content", content.verdict, content.remedies)
      : ok("site content", `${contentFile} valid`),
    assetsFailed > 0
      ? fail("images", plural(assetsFailed, "problem"), [
          { change: "see which files and what to do", run: "pnpm brand:check" },
        ])
      : ok("images", `all ${total} valid`),
  ];
}

function firebasercRow(profile: LoadedProfile, repoRoot: string): DoctorRow {
  const file = join(repoRoot, FIREBASERC);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === firebasercContent(profile.brand)) {
    return ok(FIREBASERC, `in sync (project ${profile.brand.firebase.projectId})`);
  }
  return fail(FIREBASERC, current === null ? "missing" : `not generated from "${profile.slug}"`, [
    { run: "pnpm brand:apply" },
  ]);
}

async function bucketRow(profile: LoadedProfile, run: CommandRunner): Promise<DoctorRow> {
  const bucket = profile.brand.assetsBucket;
  let listing: string;
  try {
    listing = await run("gcloud", [
      "storage",
      "objects",
      "list",
      bucketUrl(bucket, "**"),
      "--format=value(name)",
    ]);
  } catch (error) {
    if (!(error instanceof CommandError) || error.kind !== "notFound") throw error;
    return fail("bucket", `${bucketUrl(bucket)} does not exist yet`, [
      PRINT_GCP_SETUP,
      {
        change:
          "then create the bucket, step 3 of that printout (after step 1: the grant needs CD's deploy account)",
        run: "pnpm brand:provision --apply",
      },
    ]);
  }
  const names = new Set(listing.split("\n").map((line) => line.trim()));
  const missing = ASSET_CONTRACT.filter(({ path }) => !names.has(path)).length;
  const total = ASSET_CONTRACT.length;
  return missing === 0
    ? ok("bucket", `all ${total} images in ${bucketUrl(bucket)}`)
    : fail("bucket", `${missing} of ${total} images missing from ${bucketUrl(bucket)}`, [
        { change: "upload the images (project owner)", run: "pnpm brand:push" },
      ]);
}

/** `>=X.Y.Z` only, the form `engines.node` uses here. */
function meetsMinimum(version: string, range: string): boolean | null {
  const minimum = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
  const actual = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!minimum || !actual) return null;
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(actual[part]) - Number(minimum[part]);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

const rootManifestSchema = z.looseObject({
  engines: z.looseObject({ node: z.string().optional() }).optional(),
  packageManager: z.string().optional(),
});

function readRootManifest(repoRoot: string): z.infer<typeof rootManifestSchema> {
  const parsed = rootManifestSchema.safeParse(
    readJsonFile(join(repoRoot, "package.json"), "package.json"),
  );
  return parsed.success ? parsed.data : {};
}

async function nodeRow(repoRoot: string, nodeVersion: string): Promise<DoctorRow> {
  const engines = readRootManifest(repoRoot).engines?.node;
  const meets = engines ? meetsMinimum(nodeVersion, engines) : true;
  if (meets === null) return warn("node", `${nodeVersion} (cannot read engines "${engines}")`);
  return meets
    ? ok("node", nodeVersion)
    : fail("node", `${nodeVersion} (needs ${engines})`, [
        { change: "switch to the version in .nvmrc", run: "nvm install && nvm use" },
      ]);
}

async function pnpmRow(repoRoot: string, run: CommandRunner): Promise<DoctorRow> {
  const version = (await run("pnpm", ["--version"])).trim();
  const pinned = readRootManifest(repoRoot).packageManager?.replace(/^pnpm@/, "");
  return !pinned || version === pinned
    ? ok("pnpm", version)
    : warn("pnpm", `${version} (packageManager pins ${pinned})`, [
        {
          change: "use the pnpm that package.json's packageManager pins",
          run: "corepack enable && corepack install",
        },
      ]);
}

async function gcloudAccountRow(run: CommandRunner): Promise<DoctorRow> {
  const account = (
    await run("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"])
  ).trim();
  return account
    ? ok("gcloud account", account.split("\n")[0] ?? account)
    : fail("gcloud account", "nobody signed in", [{ run: "gcloud auth login", where: "shell" }]);
}

/**
 * One row per check (spec section 5.9), every row always reported. Reads only: the
 * external commands are `gcloud auth list`, `gcloud storage objects list` and
 * `pnpm --version`.
 */
export async function doctor({
  repoRoot = REPO_ROOT,
  env = process.env,
  run = runCommand,
  nodeVersion = process.versions.node,
  profile: flag,
}: {
  repoRoot?: string;
  env?: Env;
  run?: CommandRunner;
  nodeVersion?: string;
  /** `--profile <slug>`: diagnose another profile than luminova.json's. */
  profile?: string;
} = {}): Promise<{ rows: DoctorRow[]; profile?: LoadedProfile }> {
  const { rows: profileChecks, profile } = profileRows(repoRoot, env, flag);
  // A local-only profile has no cloud yet: those rows wait for going live, and doctor
  // never calls gcloud for them.
  const local = profile !== undefined && isDemoProject(profile.brand.firebase.projectId);
  const cloud = (check: string, body: (profile: LoadedProfile) => Promise<DoctorRow>) =>
    !profile ? skip(check) : local ? skip(check, LOCAL_ONLY) : attempt(check, () => body(profile));
  // The external commands are independent; start them together, report in order.
  const [account, bucket, pnpm] = await Promise.all([
    local
      ? skip("gcloud account", LOCAL_ONLY)
      : attempt("gcloud account", () => gcloudAccountRow(run)),
    cloud("bucket", (loaded) => bucketRow(loaded, run)),
    attempt("pnpm", () => pnpmRow(repoRoot, run)),
  ]);

  // Rows run in the order fixes must happen: the tools, the selection, the profile, then
  // the cloud.
  const rows = [
    await attempt("node", () => nodeRow(repoRoot, nodeVersion)),
    pnpm,
    configRow(repoRoot, env),
    ...profileChecks,
    ...(profile
      ? await brandRows(profile, repoRoot, env).catch((error: unknown) => [
          failed("site content", error),
          failed("images", error),
        ])
      : [skip("site content"), skip("images")]),
    profile
      ? await attempt(FIREBASERC, async () => firebasercRow(profile, repoRoot))
      : skip(FIREBASERC),
    await cloud("CD identity", async (loaded) => cdIdentityRow(loaded)),
    account,
    bucket,
  ];
  return { rows, profile };
}

/** luminova.json selects the chapter; a leftover shell override is flagged, not obeyed silently. */
function configRow(repoRoot: string, env: Env): DoctorRow {
  let profile: string;
  try {
    profile = readLuminovaConfig(repoRoot).profile;
  } catch (error) {
    return failed(CONFIG_FILE, error);
  }
  const override = env[PROFILE_OVERRIDE_ENV]?.trim();
  return override && override !== profile
    ? warn(
        CONFIG_FILE,
        `selects "${profile}", but ${PROFILE_OVERRIDE_ENV}=${override} overrides it`,
        [REMOVE_OVERRIDE],
      )
    : ok(CONFIG_FILE, `selects "${profile}"`);
}

function cdIdentityRow(profile: LoadedProfile): DoctorRow {
  const missing = missingDeployProblem(profile);
  if (missing) return warn("CD identity", missing.message, missing.remedies);
  return ok("CD identity", profile.brand.deploy?.serviceAccount ?? "");
}

/** The remedies of failing and warning rows, each once, in row (fix) order. */
export const doctorRemedies = (rows: readonly DoctorRow[]): Remedy[] =>
  uniqueRemedies(
    rows
      .filter(({ status }) => status === "fail" || status === "warn")
      .flatMap(({ remedies }) => remedies ?? []),
  );

const LOCAL_ONLY = "local-only profile; comes with going live (pnpm brand:init --connect)";

/**
 * With every row passing, what remains is a choice (spec L5): a local-only profile can go
 * live by connecting a project; a connected one goes live by merging to main.
 */
export function doctorNext(profile: LoadedProfile): Remedy[] {
  const { slug } = profile;
  if (isDemoProject(profile.brand.firebase.projectId)) {
    return [
      { change: "see your chapter's sites on this computer", run: "pnpm dev" },
      CONNECT_PROJECT,
    ];
  }
  return [
    {
      change: `when you are ready to go live: merge brand/${slug}/ and ${CONFIG_FILE} to main in your fork. The merge starts the first deploy; approve it in GitHub (docs/adopting.md step 12)`,
    },
    {
      change: "later, to deploy everything again without a merge (project owner)",
      run: deployDispatch("all"),
      where: "shell",
    },
  ];
}

if (import.meta.main) {
  await exitOnFailure(async () => {
    const { rows, profile } = await doctor({ profile: cliFlag("--profile") });
    console.log(
      formatTable([
        ["CHECK", "STATUS", "DETAIL"],
        ...rows.map(({ check, status, detail }) => [check, status, detail]),
      ]),
    );
    const fix = formatRemedies(doctorRemedies(rows));
    if (fix) console.log(`\n${fix}`);
    const failed = rows.filter(({ status }) => status === "fail").length;
    if (failed > 0) {
      console.error(`brand:doctor: ${plural(failed, "check")} failed.`);
      process.exit(1);
    }
    // Every row passed, so the profile loaded.
    if (!profile) return;
    const next = doctorNext(profile);
    console.log(`brand:doctor: every check passed.\n\n${formatNext(next)}`);
  });
}
