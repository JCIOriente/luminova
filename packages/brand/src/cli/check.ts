import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_FILE, SCHEMA_LINE, inheritedExampleValues, parseBrandToml } from "../brand-file.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  PROFILE_OVERRIDE_ENV,
  ProfileNotFoundError,
  ProfileSelectionError,
  REMOVE_OVERRIDE,
  REPO_ROOT,
  SOURCE_LABEL,
  brandFileLabel,
  errorMessage,
  loadProfile,
  discoverProfile,
  isExplicitSource,
  overriddenChapter,
  overrideNote,
  type DiscoveredSource,
  type Env,
  type LoadedProfile,
} from "../load-profile.ts";
import { LOCAL_PROFILE, bucketContract } from "../local-folder.ts";
import { FIREBASERC, firebasercContent, readFirebaserc } from "./apply.ts";
import { formatNext, type Problem, type Remedy, guideStep } from "../remedy.ts";
import { CommandError, bucketUrl, listBucket, runCommand, type CommandRunner } from "./gcloud.ts";
import { checkImages } from "./images.ts";
import { runBrandCommand } from "./main.ts";
import { deployDispatch } from "./push.ts";
import { CONNECT_PROJECT } from "../release.ts";
import {
  PROJECT_NUMBER_PATTERN,
  PROJECT_NUMBER_VARIABLE,
  PROJECT_VARIABLE,
  deploySaEmail,
} from "../deploy-identity.ts";
import { forkRepo, type ForkLookup } from "./github-repo.ts";
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

const problemOf = (error: BrandConfigError): Problem => ({
  message: error.errors.join("; "),
  remedies: error.remedies,
});

/** A caught error as a row: its message in the cell (never a "To fix:" block), its remedies. */
function failed(check: string, error: unknown): CheckRow {
  if (error instanceof BrandConfigError) {
    const { message, remedies } = problemOf(error);
    return fail(check, message, remedies);
  }
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

/**
 * Valid, and the first line points editors at the schema (Taplo, Even Better TOML); a
 * missing line is a note, not a failure: the build never reads it.
 */
function brandFileRow(text: string): CheckRow {
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (firstLine === SCHEMA_LINE) return ok(BRAND_FILE, "valid");
  return warn(
    BRAND_FILE,
    `valid, but line 1 is not "${SCHEMA_LINE}", so editors offer no hover help or completion`,
    [{ change: `add "${SCHEMA_LINE}" as line 1 of the profile's ${BRAND_FILE}` }],
  );
}

const listed = (items: readonly string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");

/** A note, never a failure, while a chapter's sites state the example's year, email or map. */
function exampleValuesRows({ slug }: LoadedProfile, text: string): CheckRow[] {
  if (slug === EXAMPLE_PROFILE) return [];
  const label = brandFileLabel(slug);
  const inherited = inheritedExampleValues(parseBrandToml(text, label));
  if (inherited.length === 0) return [];
  return [
    warn(
      "example values",
      `${listed(inherited)} ${inherited.length > 1 ? "are" : "is"} still the example's`,
      [
        {
          change: `set them in ${label} (brand/${EXAMPLE_PROFILE}/${BRAND_FILE} shows each)`,
        },
      ],
    ),
  ];
}

function profileRows(repoRoot: string, env: Env): { rows: CheckRow[]; profile?: LoadedProfile } {
  let profile: LoadedProfile;
  try {
    profile = loadProfile({ repoRoot, env });
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    const detail = problemOf(error).message;
    // brand/ without a single choice is the selection row's failure; it says how to fix it.
    if (error instanceof ProfileSelectionError) {
      return { rows: [skip("profile", `needs a ${SELECTION}`), skip(BRAND_FILE)] };
    }
    if (error instanceof ProfileNotFoundError) {
      return { rows: [fail("profile", detail, error.remedies), skip(BRAND_FILE)] };
    }
    return { rows: [ok("profile", "found"), fail(BRAND_FILE, detail, error.remedies)] };
  }
  const { slug, source, dir } = profile;
  const text = readFileSync(join(dir, BRAND_FILE), "utf8");
  return {
    rows: [
      // The selection row already says why brand/ chose it; only an override is noted.
      ok(
        "profile",
        `brand/${slug}/${isExplicitSource(source) ? ` (${SOURCE_LABEL[source]})` : ""}`,
      ),
      brandFileRow(text),
      ...exampleValuesRows(profile, text),
    ],
    profile,
  };
}

function firebasercRow(profile: LoadedProfile, repoRoot: string): CheckRow {
  const current = readFirebaserc(repoRoot);
  if (current === firebasercContent(profile.brand)) {
    return ok(FIREBASERC, `in sync (project ${profile.brand.firebase.projectId})`);
  }
  return fail(FIREBASERC, current === null ? "missing" : `not generated from "${profile.slug}"`, [
    { run: "pnpm brand:apply" },
  ]);
}

async function bucketRow(profile: LoadedProfile, run: CommandRunner): Promise<CheckRow> {
  const bucket = profile.brand.assetsBucket;
  let names: Map<string, string>;
  try {
    names = await listBucket(run, bucket);
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
  const contract = bucketContract(profile);
  const missing = contract.filter((path) => !names.has(path)).length;
  const total = contract.length;
  return missing === 0
    ? ok("bucket", `all ${total} files in ${bucketUrl(bucket)}`)
    : fail("bucket", `${missing} of ${total} files missing from ${bucketUrl(bucket)}`, [
        { change: "upload brand/local/ (project owner)", run: "pnpm brand:push" },
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
  const overridden = source === "local" ? overriddenChapter(repoRoot) : null;
  if (overridden) {
    const { message, remedy } = overrideNote(overridden);
    notes.push(message);
    remedies.push(remedy);
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

const CD_IDENTITY = "CD identity";
const PRINT_GCP_SETUP: Remedy = {
  change: "print the Google Cloud and GitHub setup, step by step, with your values",
  run: "pnpm brand:provision",
};

/** A repository variable's value, null when it is not set; throws when gh cannot tell. */
async function readVariable(
  run: CommandRunner,
  name: string,
  repo: string,
): Promise<string | null> {
  try {
    return (await run("gh", ["variable", "get", name, "--repo", repo])).trim() || null;
  } catch (error) {
    if (
      error instanceof CommandError &&
      error.kind === "other" &&
      /not found/i.test(error.message)
    ) {
      return null;
    }
    throw error;
  }
}

const SET_ORIGIN: Remedy = {
  change: "point the git remote origin at your fork on github.com",
  run: "git remote set-url origin <your fork's URL>",
  where: "shell",
};

/**
 * The repository variables CD deploys with (`gh variable get --repo <fork>`, read-only), on
 * the fork origin names (null: not readable, the row says why). Unreadable or unset is a
 * note; only a value CD would refuse fails.
 */
async function cdIdentityRow(
  profile: LoadedProfile,
  run: CommandRunner,
  fork: ForkLookup,
): Promise<CheckRow> {
  const { repo } = fork;
  if (repo === null) {
    return warn(CD_IDENTITY, fork.problem ?? "no fork", [SET_ORIGIN]);
  }
  let project: string | null;
  let number: string | null;
  try {
    [project, number] = await Promise.all([
      readVariable(run, PROJECT_VARIABLE, repo),
      readVariable(run, PROJECT_NUMBER_VARIABLE, repo),
    ]);
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    return warn(
      CD_IDENTITY,
      `could not read the repository variables: ${error.message}`,
      error.remedies,
    );
  }
  const { projectId, web } = profile.brand.firebase;
  const unset = [
    ...(project === null ? [PROJECT_VARIABLE] : []),
    ...(number === null ? [PROJECT_NUMBER_VARIABLE] : []),
  ];
  if (project === null || number === null) {
    const noun =
      unset.length > 1
        ? `repository variables ${unset.join(", ")} are`
        : `repository variable ${unset.join("")} is`;
    return warn(
      CD_IDENTITY,
      `${noun} not set, so CD deploys nothing yet (step 2 of pnpm brand:provision)`,
      [PRINT_GCP_SETUP],
    );
  }
  if (project !== projectId) {
    return fail(
      CD_IDENTITY,
      `repository variable ${PROJECT_VARIABLE} is "${project}", but ${BRAND_FILE} names "${projectId}": CD would refuse to deploy this brand`,
      [
        {
          change: `point CD at this brand's project (or fix ${BRAND_FILE} if the variable is right)`,
          run: `gh variable set ${PROJECT_VARIABLE} --body ${projectId} --repo ${repo}`,
          where: "shell",
        },
      ],
    );
  }
  if (!PROJECT_NUMBER_PATTERN.test(number)) {
    return fail(
      CD_IDENTITY,
      `repository variable ${PROJECT_NUMBER_VARIABLE} is "${number}", not a project number`,
      [PRINT_GCP_SETUP],
    );
  }
  // A web app id is 1:<project number>:web:<hash>, so the two must agree.
  if (number !== web.messagingSenderId) {
    return warn(
      CD_IDENTITY,
      `repository variable ${PROJECT_NUMBER_VARIABLE} is "${number}", but the web apps of ${BRAND_FILE} belong to project number ${web.messagingSenderId}`,
      [PRINT_GCP_SETUP],
    );
  }
  return ok(
    CD_IDENTITY,
    `${PROJECT_VARIABLE}=${project}, ${PROJECT_NUMBER_VARIABLE}=${number}: CD signs in as ${deploySaEmail(project)}`,
  );
}

/** The row, with a note when the fork it read is spelled as origin writes it, unconfirmed. */
const withCaseNote = (row: CheckRow, caseNote: string | undefined): CheckRow =>
  caseNote ? { ...row, detail: `${row.detail}. Note: ${caseNote}` } : row;

const LOCAL_ONLY = "local-only profile; comes with going live (pnpm brand:init connects it)";
const EXAMPLE = "the example profile; your chapter's own goes live (pnpm brand:init creates it)";

/**
 * Why going live is not checked yet, or null when it is: the example never goes live, and a
 * local-only profile has no cloud yet.
 */
function goingLiveWaits(profile: LoadedProfile | undefined): string | null {
  if (profile?.source === "example") return EXAMPLE;
  if (profile?.localOnly) return LOCAL_ONLY;
  return null;
}

const CREATE_PROFILE: Remedy = {
  change: "or create your chapter's own profile",
  run: "pnpm brand:init",
};

export const SECTION_TITLES = {
  tools: "Tools on this computer",
  chapter: "Your chapter",
  live: "Going live",
} as const;

function imagesSection(profile: LoadedProfile | undefined, repoRoot: string): Section {
  if (!profile) return { title: "Images", rows: [skip("images")] };
  try {
    return checkImages({ profile, repoRoot });
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
} = {}): Promise<{
  sections: Section[];
  profile?: LoadedProfile;
  /** CD's repository variables are set and match the brand: a deploy would run. */
  cdReady: boolean;
  /** The fork the variables were read from, for the commands to print. */
  repo: string | null;
}> {
  // Nothing else runs on native Windows (brand-setup spec S7).
  const windows = nativeWindows(platform);
  if (windows) {
    return {
      sections: [{ title: SECTION_TITLES.tools, rows: [windows] }],
      cdReady: false,
      repo: null,
    };
  }
  const { rows: profileChecks, profile } = profileRows(repoRoot, env);
  // While going live waits, nothing calls gcloud or gh.
  const waits = goingLiveWaits(profile);
  const tools = (part: Part) =>
    toolRows({ parts: [part], repoRoot, run, env, nodeVersion, platform, home });
  // The external commands are independent; start them together, report in order.
  const live = profile && !waits ? profile : undefined;
  const forkLookup: Promise<ForkLookup> = live
    ? forkRepo({ run, repoRoot, projectId: live.brand.firebase.projectId })
    : Promise.resolve({ repo: null, problem: null });
  const [trying, liveTools, bucket, cdIdentity, fork] = await Promise.all([
    tools("try"),
    waits ? [] : tools("live"),
    live ? attempt("bucket", () => bucketRow(live, run)) : skip("bucket"),
    live
      ? attempt(CD_IDENTITY, async () => {
          const fork = await forkLookup;
          return withCaseNote(await cdIdentityRow(live, run, fork), fork.caseNote);
        })
      : skip(CD_IDENTITY),
    forkLookup.catch(() => ({ repo: null, problem: null })),
  ]);

  const chapter = [
    selectionRow(repoRoot, env),
    ...profileChecks,
    profile
      ? await attempt(FIREBASERC, async () => firebasercRow(profile, repoRoot))
      : skip(FIREBASERC),
  ];
  const goingLive = waits ? [skip("going live", waits)] : [cdIdentity, ...liveTools, bucket];
  return {
    sections: [
      { title: SECTION_TITLES.tools, rows: trying },
      { title: SECTION_TITLES.chapter, rows: chapter },
      imagesSection(profile, repoRoot),
      { title: SECTION_TITLES.live, rows: goingLive },
    ],
    profile,
    cdReady: cdIdentity.status === "ok",
    repo: fork.repo,
  };
}

/**
 * With every row passing, what remains is a choice (spec L5): the example can be tried or
 * replaced by the chapter's own profile; a local-only profile can go live by connecting a
 * project; a connected one goes live once CD's repository variables are set (`cdReady`).
 */
export function checkNext(
  profile: LoadedProfile,
  { cdReady, repo }: { cdReady: boolean; repo: string | null },
): Remedy[] {
  const { slug } = profile;
  if (profile.source === "example") {
    return [
      { change: "see the example's sites on this computer", run: "pnpm dev" },
      CREATE_PROFILE,
    ];
  }
  if (profile.localOnly) {
    return [
      { change: "see your chapter's sites on this computer", run: "pnpm dev" },
      CONNECT_PROJECT,
    ];
  }
  // Without CD's variables a deploy does nothing (Deploy skips), so that comes first.
  if (!cdReady) {
    return [
      {
        change: `set up keyless CD and the assets bucket (${guideStep("provision")})`,
        run: "pnpm brand:provision",
      },
    ];
  }
  if (slug === LOCAL_PROFILE) {
    return [
      {
        change: "when you are ready to go live: upload brand/local/ to the bucket (project owner)",
        run: "pnpm brand:push",
      },
      {
        change: `then deploy everything from your fork; approve the run in GitHub (${guideStep("goLive")})`,
        run: deployDispatch("all", repo),
        where: "shell",
      },
    ];
  }
  // TRANSITIONAL (the JCI Oriente removal PR drops this): a chapter committed in brand/.
  return [
    {
      change: `when you are ready to go live: merge brand/${slug}/ to main in your fork. The merge starts the first deploy; approve it in GitHub (${guideStep("goLive")})`,
    },
    {
      change: "later, to deploy everything again without a merge (project owner)",
      run: deployDispatch("all", repo),
      where: "shell",
    },
  ];
}

if (import.meta.main) {
  await runBrandCommand("brand:check", async () => {
    const { sections, profile, cdReady, repo } = await check();
    const { text, failures } = formatReport(sections);
    console.log(text);
    if (failures > 0) {
      console.error(`\nbrand:check: ${plural(failures, "problem")}.`);
      process.exit(1);
    }
    // A failing profile row exits above; the guard only narrows the type.
    if (!profile) return;
    const notes = sections.flatMap(({ rows }) => rows).filter(({ status }) => status === "warn");
    const summary =
      notes.length > 0
        ? `no problems; ${plural(notes.length, "note")} above, worth a look`
        : "everything is ready";
    console.log(
      `\nbrand:check: ${summary}.\n\n${formatNext(checkNext(profile, { cdReady, repo }))}`,
    );
  });
}
