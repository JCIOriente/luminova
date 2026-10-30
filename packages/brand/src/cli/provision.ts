import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { z } from "zod";
import {
  POOL_ID,
  PROJECT_NUMBER_VARIABLE,
  PROJECT_VARIABLE,
  PROVIDER_ID,
  attributeCondition,
  deploySaEmail,
} from "../deploy-identity.ts";
import {
  BrandConfigError,
  REPO_ROOT,
  issuesToBrandError,
  readJsonFile,
  type LoadedProfile,
} from "../load-profile.ts";
import { CONNECT_PROJECT, undeployableProfileErrors } from "../release.ts";
import { formatNext, type Remedy, guideStep } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, shellQuote, type CommandRunner } from "./gcloud.ts";
import { FORK_HINT, forkRepo } from "./github-repo.ts";
import { runCli } from "./main.ts";
import { terminalConfirm, type Confirm } from "./prompts.ts";
import { deployDispatch } from "./push.ts";

const LIFECYCLE_FILE = "brand/bucket-lifecycle.json";
const CI_CD_DOC = "docs/ci-cd.md";
const VIEWER_ROLE = "roles/storage.objectViewer";

// gcloud's standardized output omits a setting that is off.
const bucketStateSchema = z.looseObject({
  uniform_bucket_level_access: z.boolean().optional(),
  public_access_prevention: z.string().optional(),
  versioning_enabled: z.boolean().optional(),
  lifecycle_config: z.unknown().optional(),
});
type BucketState = z.infer<typeof bucketStateSchema>;

const iamPolicySchema = z.looseObject({
  bindings: z
    .array(z.looseObject({ role: z.string(), members: z.array(z.string()).default([]) }))
    .default([]),
});

const lifecycleFileSchema = z.looseObject({ lifecycle: z.unknown() });

interface BucketStep {
  label: string;
  args: string[];
  isDone: (state: BucketState, members: readonly string[]) => boolean;
}

/** The account CD signs in as: the one section 6 creates (a DEPLOY_SA variable overrides it in CD). */
const deployAccount = ({ brand }: LoadedProfile) => deploySaEmail(brand.firebase.projectId);

/** Part B steps B1–B3 (spec section 5.7), the one list both modes use. */
function bucketSteps(
  profile: LoadedProfile,
  repoRoot: string,
  lifecyclePath: string,
): BucketStep[] {
  const { projectId } = profile.brand.firebase;
  const bucket = bucketUrl(profile.brand.assetsBucket);
  const member = `serviceAccount:${deployAccount(profile)}`;
  const lifecycleFile = lifecycleFileSchema.safeParse(
    readJsonFile(join(repoRoot, LIFECYCLE_FILE), LIFECYCLE_FILE),
  );
  if (!lifecycleFile.success) throw issuesToBrandError(LIFECYCLE_FILE, lifecycleFile.error.issues);
  const rule = lifecycleFile.data.lifecycle;
  return [
    {
      label: "create the bucket",
      args: [
        "storage",
        "buckets",
        "create",
        bucket,
        `--project=${projectId}`,
        "--location=us-central1",
        "--default-storage-class=STANDARD",
        "--uniform-bucket-level-access",
        "--public-access-prevention",
      ],
      // Only reached when describe found the bucket.
      isDone: () => true,
    },
    {
      label: "private (no public access)",
      args: [
        "storage",
        "buckets",
        "update",
        bucket,
        "--uniform-bucket-level-access",
        "--public-access-prevention",
      ],
      isDone: (state) =>
        state.uniform_bucket_level_access === true && state.public_access_prevention === "enforced",
    },
    {
      label: "keep old versions (for rollback)",
      args: ["storage", "buckets", "update", bucket, "--versioning"],
      isDone: (state) => state.versioning_enabled === true,
    },
    {
      label: "keep the last 3 old versions of each file",
      args: ["storage", "buckets", "update", bucket, `--lifecycle-file=${lifecyclePath}`],
      isDone: (state) => isDeepStrictEqual(state.lifecycle_config, rule),
    },
    {
      label: "let the deploy account read it",
      args: [
        "storage",
        "buckets",
        "add-iam-policy-binding",
        bucket,
        `--member=${member}`,
        `--role=${VIEWER_ROLE}`,
      ],
      isDone: (_, members) => members.includes(member),
    },
  ];
}

async function describeBucket(run: CommandRunner, bucket: string): Promise<BucketState | null> {
  let raw: string;
  try {
    raw = await run("gcloud", ["storage", "buckets", "describe", bucket, "--format=json"]);
  } catch (error) {
    // A missing bucket and a denied describe look alike; create then fails with the real cause.
    if (error instanceof CommandError) return null;
    throw error;
  }
  return bucketStateSchema.parse(JSON.parse(raw));
}

async function viewerMembers(run: CommandRunner, bucket: string): Promise<string[]> {
  const policy = iamPolicySchema.parse(
    JSON.parse(
      await run("gcloud", ["storage", "buckets", "get-iam-policy", bucket, "--format=json"]),
    ),
  );
  return policy.bindings
    .filter(({ role }) => role === VIEWER_ROLE)
    .flatMap(({ members }) => members);
}

/** What follows: after the printout, step 3 by answering y; after it, the upload (step 4). */
export function provisionNext({ applied }: { applied: boolean }): Remedy[] {
  if (!applied) {
    return [
      {
        change:
          "do steps 1 and 2 above, then run this again in a terminal and answer y to let it do step 3 (project owner)",
        run: "pnpm brand:provision",
      },
    ];
  }
  return [
    { change: "step 4: upload your images to the bucket", run: "pnpm brand:push" },
    { change: "confirm every row passes", run: "pnpm brand:check" },
  ];
}

const BUCKET_QUESTION =
  "Steps 1 and 2 done? Then this can do step 3 now: create and set up the bucket (skips what is done). Do step 3 now?";

/**
 * After the printout, offers step 3. Without a terminal (`confirm` absent) or on a no,
 * nothing changes and the result is null.
 */
export async function offerBucket({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
  confirm,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
  confirm?: Confirm;
}): Promise<BucketResult[] | null> {
  if (!confirm) return null;
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  if (!(await confirm(BUCKET_QUESTION))) return null;
  return applyBucket({ profile, repoRoot, run });
}

type BucketResult = { label: string; done: boolean };

/** Step 3: runs each bucket step whose state shows it undone; never touches GitHub. */
export async function applyBucket({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
}): Promise<BucketResult[]> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const steps = bucketSteps(profile, repoRoot, join(repoRoot, LIFECYCLE_FILE));
  const bucket = bucketUrl(profile.brand.assetsBucket);
  const [create, ...rest] = steps;
  if (!create) throw new Error("unreachable: no bucket steps");

  const results: BucketResult[] = [];
  let state = await describeBucket(run, bucket);
  if (state) {
    results.push({ label: create.label, done: true });
  } else {
    await run("gcloud", create.args);
    results.push({ label: create.label, done: false });
    state = (await describeBucket(run, bucket)) ?? {};
  }
  const members = await viewerMembers(run, bucket);
  for (const step of rest) {
    const done = step.isDone(state, members);
    if (!done) await run("gcloud", step.args);
    results.push({ label: step.label, done });
  }
  return results;
}

/**
 * What a fork's variables are set from, looked up once: the project number and the fork (null
 * when not known), and why the fork is not known when its origin is upstream.
 */
export interface DeployTarget {
  projectNumber: string | null;
  ghRepo: string | null;
  warning?: string | null;
  /** Set when gh could not confirm the fork's letter case. */
  caseNote?: string | null;
}

const NUMBER_HINT = (projectId: string) =>
  `gcloud projects describe ${projectId} --format='value(projectNumber)'`;

export async function lookupDeployTarget({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
}): Promise<DeployTarget> {
  const { projectId } = profile.brand.firebase;
  const [projectNumber, fork] = await Promise.all([
    lookup(run, "gcloud", ["projects", "describe", projectId, "--format=value(projectNumber)"]),
    forkRepo({ run, repoRoot, projectId }),
  ]);
  // A missing or foreign origin is a value to fill in; only upstream needs a warning.
  const warning = fork.upstream ? fork.problem : null;
  return { projectNumber, ghRepo: fork.repo, warning, caseNote: fork.caseNote ?? null };
}

/** `gh variable set` arguments for one of CD's two repository variables, on the fork. */
const setVariable = (name: string, value: string, repo: string) => [
  "variable",
  "set",
  name,
  "--body",
  value,
  "--repo",
  repo,
];

export type VariablesOffer = { set: true } | { set: false; reason: string | null };

/**
 * After the printout, offers step 2: setting the repository variables with gh. Without a
 * terminal, or on a no (the default), nothing changes and there is nothing to explain;
 * without a known project number and fork it does not ask, and says why.
 */
export async function offerVariables({
  profile,
  target,
  run = runCommand,
  confirm,
}: {
  profile: LoadedProfile;
  target: DeployTarget;
  run?: CommandRunner;
  confirm?: Confirm;
}): Promise<VariablesOffer> {
  if (!confirm) return { set: false, reason: null };
  const { projectId } = profile.brand.firebase;
  const { projectNumber, ghRepo, warning } = target;
  if (projectNumber === null || ghRepo === null) {
    if (warning) return { set: false, reason: warning };
    const unknown = [
      ...(projectNumber === null
        ? [`the project number of ${projectId} could not be looked up (${NUMBER_HINT(projectId)})`]
        : []),
      ...(ghRepo === null
        ? [`your fork could not be read from the git remote origin (git remote get-url origin)`]
        : []),
    ];
    return { set: false, reason: unknown.join(", and ") };
  }
  const question = `Step 1 done? Then this can do step 2 now: set ${PROJECT_VARIABLE}=${projectId} and ${PROJECT_NUMBER_VARIABLE}=${projectNumber} on ${ghRepo}. Do step 2 now?`;
  if (!(await confirm(question))) return { set: false, reason: null };
  await run("gh", setVariable(PROJECT_VARIABLE, projectId, ghRepo));
  await run("gh", setVariable(PROJECT_NUMBER_VARIABLE, projectNumber, ghRepo));
  return { set: true };
}

/** The fenced bash block under `## 6.` in docs/ci-cd.md, the single copy of those steps. */
export function provisioningSection(doc: string): string {
  const section = doc.slice(doc.indexOf("\n## 6."));
  const block = /```bash\n([\s\S]*?)```/.exec(section)?.[1];
  if (!block) throw new BrandConfigError([`${CI_CD_DOC}: no bash block under section 6`]);
  return block;
}

/** A value read with a read-only command, or null when it could not be (not signed in). */
async function lookup(
  run: CommandRunner,
  command: "gcloud" | "gh",
  args: string[],
): Promise<string | null> {
  try {
    return (await run(command, args)).trim() || null;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    return null;
  }
}

const LOOKUP_HINTS: Record<string, string> = {
  PROJECT_NUMBER: NUMBER_HINT("<PROJECT_ID>"),
  GH_REPO: FORK_HINT,
  REVIEWER_ID: "gh api user -q .id",
};

const command = (args: readonly string[]) => args.map(shellQuote).join(" ");

interface GuideStep {
  title: string;
  why: string;
  where: string;
  lines: readonly string[];
  check?: string;
}

const indent = (lines: readonly string[], by: string) =>
  lines.flatMap((line) => line.split("\n")).map((line) => (line ? `${by}${line}` : ""));

/** Numbered steps: what, why, where, the exact lines, and how to see that it worked. */
function formatGuide(steps: readonly GuideStep[]): string {
  return steps
    .map(({ title, why, where, lines, check }, index) =>
      [
        `Step ${index + 1} of ${steps.length}: ${title}`,
        `  Why:   ${why}`,
        `  Where: ${where}`,
        ...indent(lines, "    "),
        ...(check ? [`  Check: ${check}`] : []),
      ].join("\n"),
    )
    .join("\n\n");
}

/** Default mode: the whole Google Cloud setup with this profile's values. Read-only. */
export async function printProvisioning({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
  target,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
  /** The project number and fork, when the caller already looked them up. */
  target?: DeployTarget;
}): Promise<string> {
  const { projectId } = profile.brand.firebase;
  const { slug } = profile;
  if (profile.localOnly) {
    throw new BrandConfigError(
      [
        `profile "${slug}" is local-only (project "${projectId}"): there is no Google Cloud to set up yet.`,
      ],
      [CONNECT_PROJECT],
    );
  }
  const bucket = bucketUrl(profile.brand.assetsBucket);
  const [create, access, versioning, lifecycle, grant] = bucketSteps(
    profile,
    repoRoot,
    LIFECYCLE_FILE,
  );
  const gcloud = (step: BucketStep | undefined) => (step ? `gcloud ${command(step.args)}` : "");

  // Independent read-only lookups: one wait, not three.
  const [{ projectNumber, ghRepo, warning, caseNote }, reviewerId] = await Promise.all([
    target ?? lookupDeployTarget({ profile, repoRoot, run }),
    lookup(run, "gh", ["api", "user", "-q", ".id"]),
  ]);
  const values: Record<string, string | null> = {
    PROJECT_ID: projectId,
    PROJECT_NUMBER: projectNumber,
    GH_REPO: ghRepo,
    REVIEWER_ID: reviewerId,
  };
  const unknown = Object.keys(values).filter((key) => values[key] === null);
  // An unknown value prints as an empty export the reader must fill: a <placeholder> would
  // break the pasted shell, and the rest of the block would run without it.
  const section = provisioningSection(readFileSync(join(repoRoot, CI_CD_DOC), "utf8")).replace(
    /^export (PROJECT_ID|PROJECT_NUMBER|GH_REPO|REVIEWER_ID)=.*$/gm,
    (_, key: string) =>
      values[key] === null
        ? `export ${key}=   # FILL IN before pasting: ${LOOKUP_HINTS[key]?.replace("<PROJECT_ID>", projectId) ?? ""}`
        : `export ${key}=${values[key] ?? ""}`,
  );
  const unknownNote = unknown.length
    ? [
        `# ${unknown.join(", ")} could not be looked up. Sign in (gcloud auth login, gh auth login) and run pnpm brand:provision again, or fill in the lines marked FILL IN first.`,
      ]
    : [];
  // An unknown value is a commented line to fill in: a <placeholder> would break the shell.
  const fork = ghRepo ?? "<owner/name of your fork>";
  const variableLines = [
    ghRepo
      ? `gh ${command(setVariable(PROJECT_VARIABLE, projectId, ghRepo))}`
      : `# FILL IN, then run: gh variable set ${PROJECT_VARIABLE} --body ${projectId} --repo ${fork}   (git remote get-url origin)`,
    ghRepo && projectNumber
      ? `gh ${command(setVariable(PROJECT_NUMBER_VARIABLE, projectNumber, ghRepo))}`
      : `# FILL IN, then run: gh variable set ${PROJECT_NUMBER_VARIABLE} --body ${projectNumber ?? "<project number>"} --repo ${fork}   (${NUMBER_HINT(projectId)})`,
  ];
  const repoLabel = ghRepo ?? "your fork";
  const condition = attributeCondition(ghRepo ?? "<owner>/<repo>");

  const steps: GuideStep[] = [
    {
      title: "create CD's deploy account and its keyless sign-in (once per project)",
      why: "GitHub Actions deploys as this account. No key is stored anywhere: GitHub proves it is your repo's main branch.",
      where: `your shell, signed in to gcloud as an owner of ${projectId} (gcloud auth login) and to gh as a repo admin (gh auth login). Re-running is harmless: a line that says "already exists" means that part is done.`,
      lines: [
        ...unknownNote,
        section.trimEnd(),
        `# The provider: only ${repoLabel}'s deploy.yml on main gets a token: ${condition}`,
      ],
      check: `gcloud iam service-accounts describe ${deployAccount(profile)}; gcloud iam workload-identity-pools providers describe ${PROVIDER_ID} --project=${projectId} --location=global --workload-identity-pool=${POOL_ID} --format='value(attributeCondition)'`,
    },
    {
      title: "tell CD where to deploy: two repository variables",
      why: `CD signs in with the account and provider of step 1, derived from these two values (not secrets). Setting them is the switch that turns deploys on in ${repoLabel}; GCP_REGION, WIF_PROVIDER and DEPLOY_SA are optional overrides (docs/ci-cd.md).`,
      where:
        "your shell, signed in to gh as a repo admin; or answer y when this command asks, and it runs these two lines",
      lines: variableLines,
      check: `gh variable list${ghRepo ? ` --repo ${ghRepo}` : ""}   (or pnpm brand:check, row "CD identity")`,
    },
    {
      title: "create the private bucket for your logos and icons",
      why: "Deploys download your images from it, so they never enter git. Old versions are kept for rollback.",
      where:
        "your shell, as a project owner; or answer y when this command asks, and it does all of this step",
      lines: [gcloud(create), gcloud(access), gcloud(versioning), gcloud(lifecycle), gcloud(grant)],
      check: `gcloud storage buckets describe ${bucket} --format="yaml(public_access_prevention,uniform_bucket_level_access,versioning_enabled)"`,
    },
    {
      title: "upload your images",
      why: "The first deploy needs them in the bucket.",
      where: "the repo root",
      lines: ["pnpm brand:push"],
      check: `gcloud storage ls "${bucket}/**"`,
    },
    {
      title: "first deploy",
      why: "Pulls your brand from the bucket, builds rules, functions and both sites with it and publishes them. The first deploy to a project ships everything.",
      where: `your shell, from the repo root (or the next push to main in your fork, a merge or a Sync fork, starts it); approve the run in GitHub`,
      lines: [deployDispatch("all", ghRepo)],
      check: `open both sites and follow ${guideStep("goLive")}`,
    },
  ];

  return [
    `Google Cloud setup for profile "${slug}" (project ${projectId}). A printout only: nothing was changed. Do the steps in order.`,
    ...(warning ? ["", `Warning: ${warning}.`] : []),
    ...(caseNote ? ["", `Note: ${caseNote}.`] : []),
    "",
    formatGuide(steps),
  ].join("\n");
}

if (import.meta.main) {
  await runCli("brand:provision", async (profile) => {
    const target = await lookupDeployTarget({ profile });
    console.log(await printProvisioning({ profile, target }));
    const confirm = terminalConfirm();
    const variables = await offerVariables({ profile, target, confirm });
    if (variables.set) {
      console.log(
        `brand:provision: repository variables ${PROJECT_VARIABLE} and ${PROJECT_NUMBER_VARIABLE} set.`,
      );
    } else if (variables.reason) {
      console.log(`brand:provision: not offering to do step 2: ${variables.reason}.`);
    }
    const steps = await offerBucket({ profile, confirm });
    if (steps) {
      for (const { label, done } of steps) {
        console.log(`brand:provision: ${label}: ${done ? "already done" : "applied"}`);
      }
      console.log("brand:provision: bucket ready.");
    }
    console.log(`\n${formatNext(provisionNext({ applied: steps !== null }))}`);
  });
}
