import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { flagValue } from "../argv.ts";
import { ASSET_CONTRACT } from "../assets.ts";
import { CONFIG_FILE } from "../config.ts";
import {
  BrandConfigError,
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
import { exitOnFailure } from "./main.ts";
import { deployDispatch } from "./push.ts";
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
    if (!(error instanceof ProfileNotFoundError)) {
      return error.errors.some((line) => line.startsWith(CONFIG_FILE))
        ? { rows: [skip("profile", `needs ${CONFIG_FILE}`), skip("schema")] }
        : { rows: [ok("profile", "found"), fail("schema", detail, error.remedies)] };
    }
    return { rows: [fail("profile", detail, error.remedies), skip("schema")] };
  }
  const { slug, source } = profile;
  return {
    rows: [
      ok("profile", `${slug} (${SOURCE_LABEL[source]})`),
      ok("schema", `brand/${slug}/brand.json valid`),
    ],
    profile,
  };
}

async function brandRows(profile: LoadedProfile, repoRoot: string, env: Env): Promise<DoctorRow[]> {
  const { assets, content } = await checkBrand({ profile, repoRoot, env });
  const assetsFailed = assets.filter(({ failed }) => failed).length;
  const total = ASSET_CONTRACT.length;
  return [
    content.failed
      ? fail("site content", content.verdict, content.remedies)
      : ok("site content", "schema valid"),
    assetsFailed > 0
      ? fail("assets", plural(assetsFailed, "problem"), [
          { change: "see which files and what to do", run: "pnpm brand:check" },
        ])
      : ok("assets", `${total}/${total} files valid`),
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
      PRINT_SETUP,
      { change: "then create it (project owner)", run: "pnpm brand:provision --apply" },
    ]);
  }
  const names = new Set(listing.split("\n").map((line) => line.trim()));
  const missing = ASSET_CONTRACT.filter(({ path }) => !names.has(path)).length;
  const total = ASSET_CONTRACT.length;
  return missing === 0
    ? ok("bucket", `${total}/${total} contract files in ${bucketUrl(bucket)}`)
    : fail("bucket", `${missing} of ${total} contract files missing from ${bucketUrl(bucket)}`, [
        { change: "upload the checked set (project owner)", run: "pnpm brand:push" },
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
} = {}): Promise<DoctorRow[]> {
  const { rows: profileChecks, profile } = profileRows(repoRoot, env, flag);
  // The external commands are independent; start them together, report in order.
  const [account, bucket, pnpm] = await Promise.all([
    attempt("gcloud account", () => gcloudAccountRow(run)),
    profile ? attempt("bucket", () => bucketRow(profile, run)) : skip("bucket"),
    attempt("pnpm", () => pnpmRow(repoRoot, run)),
  ]);

  // Rows run in the order fixes must happen: the tools, the selection, the profile, then
  // the cloud.
  return [
    await attempt("node", () => nodeRow(repoRoot, nodeVersion)),
    pnpm,
    configRow(repoRoot, env),
    ...profileChecks,
    ...(profile
      ? await brandRows(profile, repoRoot, env).catch((error: unknown) => [
          failed("site content", error),
          failed("assets", error),
        ])
      : [skip("site content"), skip("assets")]),
    profile
      ? await attempt(FIREBASERC, async () => firebasercRow(profile, repoRoot))
      : skip(FIREBASERC),
    profile ? cdIdentityRow(profile) : skip("CD identity"),
    account,
    bucket,
  ];
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

const PRINT_SETUP: Remedy = {
  change:
    "print this profile's Google Cloud setup, step by step, with your values (changes nothing)",
  run: "pnpm brand:provision",
};

/** CD signs in with the profile's `deploy` names; without them the first deploy cannot start. */
function cdIdentityRow({ slug, brand }: LoadedProfile): DoctorRow {
  if (brand.deploy) return ok("CD identity", brand.deploy.serviceAccount);
  return warn(
    "CD identity",
    `brand/${slug}/brand.json has no "deploy" section (needed to deploy)`,
    [PRINT_SETUP],
  );
}

/** The remedies of failing and warning rows, each once, in row (fix) order. */
export const doctorRemedies = (rows: readonly DoctorRow[]): Remedy[] =>
  uniqueRemedies(
    rows
      .filter(({ status }) => status === "fail" || status === "warn")
      .flatMap(({ remedies }) => remedies ?? []),
  );

/** With every row passing, the local setup is done; what remains reaches CD (steps 6, 10). */
export function doctorNext(slug: string): Remedy[] {
  return [
    {
      change: `commit brand/${slug}/ and ${CONFIG_FILE}, and merge them to main in your fork (docs/adopting.md step 6)`,
    },
    {
      change: "first deploy (project owner; approve the run in GitHub, then check step 10)",
      run: deployDispatch("all"),
      where: "shell",
    },
  ];
}

if (import.meta.main) {
  await exitOnFailure(async () => {
    const flag = flagValue(
      process.argv.slice(2),
      "--profile",
      (message) => new BrandConfigError([message]),
    );
    const rows = await doctor({ profile: flag });
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
    const next = doctorNext(loadProfile({ profile: flag }).slug);
    console.log(`brand:doctor: every check passed.\n\n${formatNext(next)}`);
  });
}
