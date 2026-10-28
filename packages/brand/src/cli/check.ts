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
import { formatNext, type Problem, type Remedy, guideStep } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { checkImages } from "./images.ts";
import { runBrandCommand } from "./main.ts";
import { deployDispatch } from "./push.ts";
import { CONNECT_PROJECT, missingDeployProblem } from "../release.ts";
import { SITE_CONTENT_FILE, readSiteContent } from "../site-content.ts";
import {
  fail,
  formatReport,
  ok,
  skip as skipRow,
  warn,
  type CheckRow,
  type Section,
} from "./rows.ts";
import { plural } from "./table.ts";
import { nativeWindows, toolRows, type Part } from "./tools.ts";

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

function profileRows(repoRoot: string, env: Env): { rows: CheckRow[]; profile?: LoadedProfile } {
  let profile: LoadedProfile;
  try {
    profile = loadProfile({ repoRoot, env });
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
      // The selection row already says why brand/ chose it; only an override is noted.
      ok(
        "profile",
        `brand/${slug}/${isExplicitSource(source) ? ` (${SOURCE_LABEL[source]})` : ""}`,
      ),
      ok("brand.json", "valid"),
    ],
    profile,
  };
}

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

async function siteContentRow(profile: LoadedProfile): Promise<CheckRow> {
  const problem = await siteContentProblem(profile);
  return problem
    ? fail("site content", problem.message, problem.remedies)
    : ok("site content", `brand/${profile.slug}/${SITE_CONTENT_FILE} valid`);
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
      {
        change:
          "print the Google Cloud setup, do its steps 1 and 2, then answer y to let it create the bucket (step 3)",
        run: "pnpm brand:provision",
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

const SELECTION = "selection";

/** Spec P3: the file C1 introduced; a fork that pulled its removal may still have a copy. */
const LEGACY_CONFIG_FILE = "luminova.json";

/**
 * brand/ selects the chapter (spec P1); a leftover shell override or luminova.json is
 * flagged, never obeyed silently.
 */
function selectionRow(repoRoot: string, env: Env): CheckRow {
  let slug: string;
  let source: DiscoveredSource;
  try {
    ({ slug, source } = discoverProfile(repoRoot));
  } catch (error) {
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

const LOCAL_ONLY = "local-only profile; comes with going live (pnpm brand:init connects it)";

export const SECTION_TITLES = {
  tools: "Tools on this computer",
  chapter: "Your chapter",
  live: "Going live",
} as const;

function imagesSection(profile: LoadedProfile | undefined, repoRoot: string, env: Env): Section {
  if (!profile) return { title: "Images", rows: [skip("images")] };
  try {
    return checkImages({ profile, repoRoot, env });
  } catch (error) {
    return { title: "Images", rows: [failed("images", error)] };
  }
}

/**
 * Everything an adopter needs, in the order fixes must happen: the tools, the chapter's
 * files, its images, then going live. Reads only: the external commands are the tool checks
 * of cli/tools.ts and `gcloud storage objects list`.
 */
export async function check({
  repoRoot = REPO_ROOT,
  env = process.env,
  run = runCommand,
  nodeVersion = process.versions.node,
  platform = process.platform,
  home,
}: {
  repoRoot?: string;
  env?: Env;
  run?: CommandRunner;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  home?: string;
} = {}): Promise<{ sections: Section[]; profile?: LoadedProfile }> {
  // Nothing else runs on native Windows (brand-setup spec S7).
  const windows = nativeWindows(platform);
  if (windows) return { sections: [{ title: SECTION_TITLES.tools, rows: [windows] }] };
  const { rows: profileChecks, profile } = profileRows(repoRoot, env);
  // A local-only profile has no cloud yet: going live waits, and nothing calls gcloud or gh.
  const local = profile?.localOnly === true;
  const tools = (part: Part) =>
    toolRows({ parts: [part], repoRoot, run, env, nodeVersion, platform, home });
  // The external commands are independent; start them together, report in order.
  const [trying, live, bucket, content] = await Promise.all([
    tools("try"),
    local ? [] : tools("live"),
    profile && !local ? attempt("bucket", () => bucketRow(profile, run)) : skip("bucket"),
    profile ? attempt("site content", () => siteContentRow(profile)) : skip("site content"),
  ]);

  const chapter = [
    selectionRow(repoRoot, env),
    ...profileChecks,
    content,
    profile
      ? await attempt(FIREBASERC, async () => firebasercRow(profile, repoRoot))
      : skip(FIREBASERC),
  ];
  const goingLive = local
    ? [skip("going live", LOCAL_ONLY)]
    : [profile ? cdIdentityRow(profile) : skip("CD identity"), ...live, bucket];
  return {
    sections: [
      { title: SECTION_TITLES.tools, rows: trying },
      { title: SECTION_TITLES.chapter, rows: chapter },
      imagesSection(profile, repoRoot, env),
      { title: SECTION_TITLES.live, rows: goingLive },
    ],
    profile,
  };
}

/**
 * With every row passing, what remains is a choice (spec L5): a local-only profile can go
 * live by connecting a project; a connected one goes live by merging to main.
 */
export function checkNext(profile: LoadedProfile): Remedy[] {
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
  await runBrandCommand("brand:check", async () => {
    const { sections, profile } = await check();
    const { text, failures } = formatReport(sections);
    console.log(text);
    if (failures > 0) {
      console.error(`\nbrand:check: ${plural(failures, "problem")}.`);
      process.exit(1);
    }
    // A failing profile row exits above; the guard only narrows the type.
    if (!profile) return;
    console.log(`\nbrand:check: everything is ready.\n\n${formatNext(checkNext(profile))}`);
  });
}
