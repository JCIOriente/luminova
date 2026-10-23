import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSET_CONTRACT } from "../assets.ts";
import {
  BrandConfigError,
  DEFAULT_PROFILE,
  REPO_ROOT,
  loadProfile,
  type LoadedProfile,
} from "../load-profile.ts";
import { SLUG_PATTERN } from "../schema.ts";
import { FIREBASERC, firebasercContent } from "./apply.ts";
import { checkBrand } from "./check.ts";
import { bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { exitOnFailure } from "./main.ts";
import { formatTable } from "./table.ts";

type Env = Readonly<Record<string, string | undefined>>;

export interface DoctorRow {
  check: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

const ok = (check: string, detail: string): DoctorRow => ({ check, status: "ok", detail });
const fail = (check: string, detail: string): DoctorRow => ({ check, status: "fail", detail });
const NEEDS_PROFILE = "needs a valid profile";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function attempt(check: string, body: () => Promise<DoctorRow>): Promise<DoctorRow> {
  try {
    return await body();
  } catch (error) {
    return fail(check, message(error));
  }
}

function profileRows(repoRoot: string, env: Env): { rows: DoctorRow[]; profile?: LoadedProfile } {
  const fromEnv = env.BRAND_PROFILE?.trim();
  const slug = fromEnv || DEFAULT_PROFILE;
  const found = ok("profile", `${slug} (${fromEnv ? "from BRAND_PROFILE" : "default"})`);
  try {
    const profile = loadProfile({ repoRoot, env });
    return { rows: [found, ok("schema", `brand/${slug}/brand.json valid`)], profile };
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    const detail = error.errors.join("; ");
    // A bad slug or a missing folder fails the profile itself; anything else is the schema.
    const located =
      SLUG_PATTERN.test(slug) && existsSync(join(repoRoot, "brand", slug, "brand.json"));
    return located
      ? { rows: [found, fail("schema", detail)] }
      : {
          rows: [
            fail("profile", detail),
            { check: "schema", status: "skip", detail: NEEDS_PROFILE },
          ],
        };
  }
}

async function brandRows(profile: LoadedProfile, repoRoot: string, env: Env): Promise<DoctorRow[]> {
  const { rows } = await checkBrand({ profile, repoRoot, env });
  const content = rows.filter(({ item }) => item === "site-content.json");
  const assets = rows.filter(({ item }) => item !== "site-content.json");
  const contentFailed = content.filter(({ failed }) => failed);
  const assetsFailed = assets.filter(({ failed }) => failed).length;
  return [
    contentFailed.length > 0
      ? fail("site content", contentFailed.map(({ verdict }) => verdict).join("; "))
      : ok("site content", "schema valid"),
    assetsFailed > 0
      ? fail(
          "assets",
          `${assetsFailed} problem${assetsFailed === 1 ? "" : "s"}; run pnpm brand:check for the table`,
        )
      : ok("assets", `${ASSET_CONTRACT.length}/${ASSET_CONTRACT.length} files valid`),
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

function readRootManifest(repoRoot: string): {
  engines?: { node?: string };
  packageManager?: string;
} {
  const manifest: unknown = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return typeof manifest === "object" && manifest !== null ? manifest : {};
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
  const skip = (check: string): DoctorRow => ({ check, status: "skip", detail: NEEDS_PROFILE });

  rows.push(
    ...(profile
      ? await brandRows(profile, repoRoot, env).catch((error: unknown) => [
          fail("site content", message(error)),
          fail("assets", message(error)),
        ])
      : [skip("site content"), skip("assets")]),
  );
  rows.push(profile ? firebasercRow(profile, repoRoot) : skip(FIREBASERC));

  rows.push(
    await attempt("gcloud account", async () => {
      const account = (
        await run("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"])
      ).trim();
      return account
        ? ok("gcloud account", account.split("\n")[0] ?? account)
        : fail("gcloud account", "nobody signed in; run gcloud auth login");
    }),
  );
  rows.push(profile ? await attempt("bucket", () => bucketRow(profile, run)) : skip("bucket"));

  const selected = env.BRAND_PROFILE?.trim();
  rows.push(
    selected
      ? ok("BRAND_PROFILE", selected)
      : fail("BRAND_PROFILE", "unset; add export BRAND_PROFILE=<slug> to your shell profile"),
  );

  const manifest = readRootManifest(repoRoot);
  const engines = manifest.engines?.node;
  const meets = engines ? meetsMinimum(nodeVersion, engines) : true;
  rows.push(
    meets === null
      ? {
          check: "node",
          status: "warn",
          detail: `${nodeVersion} (cannot read engines "${engines}")`,
        }
      : meets
        ? ok("node", nodeVersion)
        : fail("node", `${nodeVersion} (needs ${engines})`),
  );

  const pinned = manifest.packageManager?.replace(/^pnpm@/, "");
  rows.push(
    await attempt("pnpm", async () => {
      const version = (await run("pnpm", ["--version"])).trim();
      return !pinned || version === pinned
        ? ok("pnpm", version)
        : { check: "pnpm", status: "warn", detail: `${version} (packageManager pins ${pinned})` };
    }),
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
      console.error(`brand:doctor: ${failed} check${failed === 1 ? "" : "s"} failed.`);
      process.exit(1);
    }
    console.log("brand:doctor: every check passed.");
  });
}
