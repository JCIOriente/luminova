import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT } from "../assets.ts";
import {
  BrandConfigError,
  cdProfileCommand,
  ProfileNotFoundError,
  REPO_ROOT,
  errorMessage,
  keepProfileCommand,
  loadProfile,
  readJsonFile,
  selectableProfiles,
  selectedProfile,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { FIREBASERC, firebasercContent } from "./apply.ts";
import { checkBrand } from "./check.ts";
import { formatNext, formatRemedies, uniqueRemedies, type Remedy } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { exitOnFailure } from "./main.ts";
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
const skip = (check: string) => row("skip")(check, "needs a valid profile");

async function attempt(check: string, body: () => Promise<DoctorRow>): Promise<DoctorRow> {
  try {
    return await body();
  } catch (error) {
    const remedies =
      error instanceof BrandConfigError || error instanceof CommandError ? error.remedies : [];
    return fail(check, errorMessage(error), remedies);
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
      ? { rows: [fail("profile", detail, error.remedies), skip("schema")] }
      : { rows: [found, fail("schema", detail, error.remedies)] };
  }
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
    if (!(error instanceof CommandError) || !/\b404\b|not found/i.test(error.message)) throw error;
    return fail("bucket", `${bucketUrl(bucket)} does not exist yet`, [
      {
        change: "print the bucket setup for this profile (changes nothing)",
        run: "pnpm brand:provision",
      },
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
    profile
      ? await attempt(FIREBASERC, async () => firebasercRow(profile, repoRoot))
      : skip(FIREBASERC),
    account,
    bucket,
  );
  const selected = env.BRAND_PROFILE?.trim();
  const profiles = selectableProfiles(repoRoot);
  // With one candidate the commands are ready to paste; otherwise the user picks.
  const slug = profiles.length === 1 ? (profiles[0] ?? "<slug>") : "<slug>";
  rows.push(
    selected
      ? ok("BRAND_PROFILE", selected)
      : fail("BRAND_PROFILE", `unset (profiles: ${profiles.join(", ") || "none"})`, [
          {
            change:
              "select it in every new terminal (or put the export in a direnv .envrc in the repo)",
            run: keepProfileCommand(slug, env),
            where: "shell",
          },
          { change: "and in this one", run: `export BRAND_PROFILE=${slug}`, where: "shell" },
          { change: "CD reads its own copy", run: cdProfileCommand(slug), where: "shell" },
        ]),
    await attempt("node", () => nodeRow(repoRoot, nodeVersion)),
    pnpm,
  );
  return rows;
}

// The order fixes must happen in: the tools and BRAND_PROFILE first (brand:provision and
// brand:push refuse without it), then the profile and its files, then the cloud.
const FIX_ORDER = [
  "node",
  "pnpm",
  "BRAND_PROFILE",
  "profile",
  "schema",
  "site content",
  "assets",
  FIREBASERC,
  "gcloud account",
  "bucket",
];

/** The remedies of failing and warning rows, each once, in the order to apply them. */
export const doctorRemedies = (rows: readonly DoctorRow[]): Remedy[] =>
  uniqueRemedies(
    rows
      .filter(({ status }) => status === "fail" || status === "warn")
      .toSorted((a, b) => FIX_ORDER.indexOf(a.check) - FIX_ORDER.indexOf(b.check))
      .flatMap(({ remedies }) => remedies ?? []),
  );

/** With every row passing, the local setup is done and the next step is a deploy. */
export function doctorNext(rows: readonly DoctorRow[]): Remedy | null {
  if (rows.some(({ status }) => status === "fail")) return null;
  return {
    change:
      "deploy through CD (project owner; approve the run in GitHub, then check docs/adopting.md step 11)",
    run: "gh workflow run deploy.yml -f surface=all",
    where: "shell",
  };
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
    const fix = formatRemedies(doctorRemedies(rows));
    if (fix) console.log(`\n${fix}`);
    const failed = rows.filter(({ status }) => status === "fail").length;
    if (failed > 0) {
      console.error(`brand:doctor: ${plural(failed, "check")} failed.`);
      process.exit(1);
    }
    const next = doctorNext(rows);
    console.log(`brand:doctor: every check passed.${next ? `\n\n${formatNext(next)}` : ""}`);
  });
}
