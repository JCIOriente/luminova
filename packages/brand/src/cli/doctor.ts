import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSET_CONTRACT } from "../assets.ts";
import {
  BrandConfigError,
  PROFILE_OVERRIDE_ENV,
  ProfileNotFoundError,
  ProfileSelectionError,
  REMOVE_OVERRIDE,
  REPO_ROOT,
  SOURCE_LABEL,
  errorMessage,
  loadProfile,
  discoverProfile,
  isExplicitSource,
  type DiscoveredSource,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { FIREBASERC, firebasercContent } from "./apply.ts";
import { checkBrand } from "./check.ts";
import { formatNext, formatRemedies, type Remedy, guideStep } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { cliFlag, exitOnFailure } from "./main.ts";
import { deployDispatch } from "./push.ts";
import { CONNECT_PROJECT, PRINT_GCP_SETUP, missingDeployProblem } from "../release.ts";
import { fail, ok, rowRemedies, skip as skipRow, warn, type CheckRow } from "./rows.ts";
import { formatTable, plural } from "./table.ts";
import { nativeWindows, toolChecks, toolRows, type Part } from "./tools.ts";

const skip = (check: string, detail = "needs a valid profile") => skipRow(check, detail);

/** A caught error as a row: its message in the cell (never a "To fix:" block), its remedies. */
function failed(check: string, error: unknown): CheckRow {
  if (error instanceof BrandConfigError)
    return fail(check, error.errors.join("; "), error.remedies);
  if (error instanceof CommandError) return fail(check, error.message, error.remedies);
  return fail(check, errorMessage(error));
}

async function attempt(check: string, body: () => Promise<CheckRow>): Promise<CheckRow> {
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
): { rows: CheckRow[]; profile?: LoadedProfile } {
  let profile: LoadedProfile;
  try {
    profile = loadProfile({ repoRoot, env, profile: flag });
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    const detail = error.errors.join("; ");
    // brand/ without a single choice is the selection row's failure; it says how to fix it.
    if (error instanceof ProfileSelectionError) {
      return { rows: [skip("profile", `needs a ${SELECTION}`), skip("brand.json")] };
    }
    if (error instanceof ProfileNotFoundError) {
      return { rows: [fail("profile", detail, error.remedies), skip("brand.json")] };
    }
    return { rows: [ok("profile", "found"), fail("brand.json", detail, error.remedies)] };
  }
  const { slug, source } = profile;
  return {
    rows: [
      // The selection row already says why brand/ chose it; only an explicit choice is noted.
      ok(
        "profile",
        `brand/${slug}/${isExplicitSource(source) ? ` (${SOURCE_LABEL[source]})` : ""}`,
      ),
      ok("brand.json", "valid"),
    ],
    profile,
  };
}

async function brandRows(profile: LoadedProfile, repoRoot: string, env: Env): Promise<CheckRow[]> {
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

function firebasercRow(profile: LoadedProfile, repoRoot: string): CheckRow {
  const file = join(repoRoot, FIREBASERC);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === firebasercContent(profile.brand)) {
    return ok(FIREBASERC, `in sync (project ${profile.brand.firebase.projectId})`);
  }
  return fail(FIREBASERC, current === null ? "missing" : `not generated from "${profile.slug}"`, [
    { run: "pnpm brand:apply" },
  ]);
}

async function bucketRow(profile: LoadedProfile, run: CommandRunner): Promise<CheckRow> {
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

/**
 * One row per check (spec section 5.9), every row always reported. Reads only: the
 * external commands are the tool checks of cli/tools.ts and `gcloud storage objects list`.
 */
export async function doctor({
  repoRoot = REPO_ROOT,
  env = process.env,
  run = runCommand,
  nodeVersion = process.versions.node,
  platform = process.platform,
  home,
  profile: flag,
}: {
  repoRoot?: string;
  env?: Env;
  run?: CommandRunner;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  home?: string;
  /** `--profile <slug>`: diagnose another profile than the one brand/ selects. */
  profile?: string;
} = {}): Promise<{ rows: CheckRow[]; profile?: LoadedProfile }> {
  // Nothing else runs on native Windows (brand-setup spec S7).
  const windows = nativeWindows(platform);
  if (windows) return { rows: [windows] };
  const { rows: profileChecks, profile } = profileRows(repoRoot, env, flag);
  // A local-only profile has no cloud yet: those rows wait for going live, and doctor
  // never calls gcloud for them.
  const local = profile?.localOnly === true;
  const cloud = (check: string, body: (profile: LoadedProfile) => Promise<CheckRow>) =>
    local ? skip(check, LOCAL_ONLY) : profile ? attempt(check, () => body(profile)) : skip(check);
  const tools = (part: Part) =>
    toolRows({ parts: [part], repoRoot, run, env, nodeVersion, platform, home, required: true });
  // The external commands are independent; start them together, report in order. Going
  // live's tools wait with the cloud rows, but only need a non-local profile (spec S5).
  const [trying, live, bucket] = await Promise.all([
    tools("try"),
    local
      ? toolChecks("live", { required: true }).map((check) => skip(check, LOCAL_ONLY))
      : tools("live"),
    cloud("bucket", (loaded) => bucketRow(loaded, run)),
  ]);

  // Rows run in the order fixes must happen: the tools, the selection, the profile, then
  // the cloud.
  const rows = [
    ...trying,
    selectionRow(repoRoot, env, flag),
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
    local
      ? skip("CD identity", LOCAL_ONLY)
      : profile
        ? cdIdentityRow(profile)
        : skip("CD identity"),
    ...live,
    bucket,
  ];
  return { rows, profile };
}

const SELECTION = "selection";

/** Spec P3: the file C1 introduced; a fork that pulled its removal may still have a copy. */
const LEGACY_CONFIG_FILE = "luminova.json";

/**
 * brand/ selects the chapter (spec P1); a leftover shell override or luminova.json is
 * flagged, never obeyed silently.
 */
function selectionRow(repoRoot: string, env: Env, flag?: string): CheckRow {
  let slug: string;
  let source: DiscoveredSource;
  try {
    ({ slug, source } = discoverProfile(repoRoot));
  } catch (error) {
    // With --profile the command still knows what to diagnose; plain commands do not.
    if (flag && error instanceof ProfileSelectionError) {
      return warn(SELECTION, error.errors.join("; "), error.remedies);
    }
    return failed(SELECTION, error);
  }
  const selects = `brand/ selects "${slug}" (${SOURCE_LABEL[source]})`;
  const notes: string[] = [];
  const remedies: Remedy[] = [];
  const override = env[PROFILE_OVERRIDE_ENV]?.trim();
  if (override && override !== slug) {
    notes.push(`${PROFILE_OVERRIDE_ENV}=${override} overrides it`);
    remedies.push(REMOVE_OVERRIDE);
  }
  if (existsSync(join(repoRoot, LEGACY_CONFIG_FILE))) {
    notes.push(`${LEGACY_CONFIG_FILE} is no longer read`);
    remedies.push({
      change: `delete ${LEGACY_CONFIG_FILE}: brand/ selects the profile now`,
      run: `git rm ${LEGACY_CONFIG_FILE}`,
    });
  }
  return notes.length > 0
    ? warn(SELECTION, `${selects}, but ${notes.join("; ")}`, remedies)
    : ok(SELECTION, selects);
}

function cdIdentityRow(profile: LoadedProfile): CheckRow {
  const missing = missingDeployProblem(profile);
  if (missing) return warn("CD identity", missing.message, missing.remedies);
  return ok("CD identity", profile.brand.deploy?.serviceAccount ?? "");
}

const LOCAL_ONLY = "local-only profile; comes with going live (pnpm brand:init --connect)";

/**
 * With every row passing, what remains is a choice (spec L5): a local-only profile can go
 * live by connecting a project; a connected one goes live by merging to main.
 */
export function doctorNext(profile: LoadedProfile): Remedy[] {
  const { slug } = profile;
  if (profile.localOnly) {
    return [
      { change: "see your chapter's sites on this computer", run: "pnpm dev" },
      CONNECT_PROJECT,
    ];
  }
  return [
    {
      change: `when you are ready to go live: merge brand/${slug}/ to main in your fork. The merge starts the first deploy; approve it in GitHub (${guideStep("goLive")})`,
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
    const fix = formatRemedies(rowRemedies(rows));
    if (fix) console.log(`\n${fix}`);
    const failed = rows.filter(({ status }) => status === "fail").length;
    if (failed > 0) {
      console.error(`brand:doctor: ${plural(failed, "check")} failed.`);
      process.exit(1);
    }
    // A failing profile row exits above; the guard only narrows the type.
    if (!profile) return;
    const next = doctorNext(profile);
    console.log(`brand:doctor: every check passed.\n\n${formatNext(next)}`);
  });
}
