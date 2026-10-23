import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT } from "../assets.ts";
import {
  BrandConfigError,
  ProfileNotFoundError,
  REPO_ROOT,
  errorMessage,
  loadProfile,
  readJsonFile,
  selectedProfile,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { FIREBASERC, firebasercContent } from "./apply.ts";
import { checkBrand } from "./check.ts";
import { bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { exitOnFailure } from "./main.ts";
import { formatTable, plural } from "./table.ts";

export interface DoctorRow {
  check: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

const row =
  (status: DoctorRow["status"]) =>
  (check: string, detail: string): DoctorRow => ({ check, status, detail });
const ok = row("ok");
const warn = row("warn");
const fail = row("fail");
const skip = (check: string) => row("skip")(check, "needs a valid profile");

async function attempt(check: string, body: () => Promise<DoctorRow>): Promise<DoctorRow> {
  try {
    return await body();
  } catch (error) {
    return fail(check, errorMessage(error));
  }
}

function profileRows(repoRoot: string, env: Env): { rows: DoctorRow[]; profile?: LoadedProfile } {
  const { slug, source } = selectedProfile({ env });
  const found = ok("profile", `${slug} (${source === "env" ? "from BRAND_PROFILE" : "default"})`);
  try {
    const profile = loadProfile({ repoRoot, env });
    return { rows: [found, ok("schema", `brand/${slug}/brand.json valid`)], profile };
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    const detail = error.errors.join("; ");
    return error instanceof ProfileNotFoundError
      ? { rows: [fail("profile", detail), skip("schema")] }
      : { rows: [found, fail("schema", detail)] };
  }
}

async function brandRows(profile: LoadedProfile, repoRoot: string, env: Env): Promise<DoctorRow[]> {
  const { assets, content } = await checkBrand({ profile, repoRoot, env });
  const assetsFailed = assets.filter(({ failed }) => failed).length;
  const total = ASSET_CONTRACT.length;
  return [
    content.failed ? fail("site content", content.verdict) : ok("site content", "schema valid"),
    assetsFailed > 0
      ? fail("assets", `${plural(assetsFailed, "problem")}; run pnpm brand:check for the table`)
      : ok("assets", `${total}/${total} files valid`),
  ];
}

function firebasercRow(profile: LoadedProfile, repoRoot: string): DoctorRow {
  const file = join(repoRoot, FIREBASERC);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === firebasercContent(profile.brand)) {
    return ok(FIREBASERC, `in sync (project ${profile.brand.firebase.projectId})`);
  }
  return fail(
    FIREBASERC,
    `${current === null ? "missing" : `not generated from "${profile.slug}"`}; run pnpm brand:apply`,
  );
}

async function bucketRow(profile: LoadedProfile, run: CommandRunner): Promise<DoctorRow> {
  const bucket = profile.brand.assetsBucket;
  const listing = await run("gcloud", [
    "storage",
    "objects",
    "list",
    bucketUrl(bucket, "**"),
    "--format=value(name)",
  ]);
  const names = new Set(listing.split("\n").map((line) => line.trim()));
  const missing = ASSET_CONTRACT.filter(({ path }) => !names.has(path)).length;
  const total = ASSET_CONTRACT.length;
  return missing === 0
    ? ok("bucket", `${total}/${total} contract files in ${bucketUrl(bucket)}`)
    : fail(
        "bucket",
        `${missing} of ${total} contract files missing from ${bucketUrl(bucket)}; upload them with pnpm brand:push`,
      );
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
  return meets ? ok("node", nodeVersion) : fail("node", `${nodeVersion} (needs ${engines})`);
}

async function pnpmRow(repoRoot: string, run: CommandRunner): Promise<DoctorRow> {
  const version = (await run("pnpm", ["--version"])).trim();
  const pinned = readRootManifest(repoRoot).packageManager?.replace(/^pnpm@/, "");
  return !pinned || version === pinned
    ? ok("pnpm", version)
    : warn("pnpm", `${version} (packageManager pins ${pinned})`);
}

async function gcloudAccountRow(run: CommandRunner): Promise<DoctorRow> {
  const account = (
    await run("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"])
  ).trim();
  return account
    ? ok("gcloud account", account.split("\n")[0] ?? account)
    : fail("gcloud account", "nobody signed in; run gcloud auth login");
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
}: {
  repoRoot?: string;
  env?: Env;
  run?: CommandRunner;
  nodeVersion?: string;
} = {}): Promise<DoctorRow[]> {
  const { rows, profile } = profileRows(repoRoot, env);
  // The external commands are independent; start them together, report in order.
  const [account, bucket, pnpm] = await Promise.all([
    attempt("gcloud account", () => gcloudAccountRow(run)),
    profile ? attempt("bucket", () => bucketRow(profile, run)) : skip("bucket"),
    attempt("pnpm", () => pnpmRow(repoRoot, run)),
  ]);

  rows.push(
    ...(profile
      ? await brandRows(profile, repoRoot, env).catch((error: unknown) => [
          fail("site content", errorMessage(error)),
          fail("assets", errorMessage(error)),
        ])
      : [skip("site content"), skip("assets")]),
    profile ? firebasercRow(profile, repoRoot) : skip(FIREBASERC),
    account,
    bucket,
  );
  const selected = env.BRAND_PROFILE?.trim();
  rows.push(
    selected
      ? ok("BRAND_PROFILE", selected)
      : fail("BRAND_PROFILE", "unset; add export BRAND_PROFILE=<slug> to your shell profile"),
    await attempt("node", () => nodeRow(repoRoot, nodeVersion)),
    pnpm,
  );
  return rows;
}

if (import.meta.main) {
  await exitOnFailure(async () => {
    const rows = await doctor();
    console.log(
      formatTable([
        ["CHECK", "STATUS", "DETAIL"],
        ...rows.map(({ check, status, detail }) => [check, status, detail]),
      ]),
    );
    const failed = rows.filter(({ status }) => status === "fail").length;
    if (failed > 0) {
      console.error(`brand:doctor: ${plural(failed, "check")} failed.`);
      process.exit(1);
    }
    console.log("brand:doctor: every check passed.");
  });
}
