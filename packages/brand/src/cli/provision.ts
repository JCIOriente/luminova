import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { z } from "zod";
import { CONFIG_FILE } from "../config.ts";
import { defaultDeploy, deploySaEmail } from "../deploy-identity.ts";
import {
  BrandConfigError,
  REPO_ROOT,
  issuesToBrandError,
  readJsonFile,
  type LoadedProfile,
} from "../load-profile.ts";
import {
  PULLED_ASSETS_DIR,
  displayDir,
  selectAssetsDir,
  undeployableProfileErrors,
} from "../release.ts";
import { formatNext, type Remedy } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, shellQuote, type CommandRunner } from "./gcloud.ts";
import { cliFlag, runCli } from "./main.ts";
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

/** The account CD signs in as: the profile's `deploy` value, else the one section 6 creates. */
const deployAccount = ({ brand }: LoadedProfile) =>
  brand.deploy?.serviceAccount ?? deploySaEmail(brand.firebase.projectId);

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

/** What follows: after the printout, `--apply`; after `--apply`, `pushCommand` (step 4). */
export function provisionNext(
  next: { applied: false } | { applied: true; pushCommand: string },
): Remedy[] {
  if (!next.applied) {
    return [
      {
        change: "do steps 1 and 2 above, then let this command do step 3 (project owner)",
        run: "pnpm brand:provision --apply",
      },
    ];
  }
  return [
    { change: "step 4: upload your images to the bucket", run: next.pushCommand },
    { change: "confirm every row passes", run: "pnpm brand:doctor" },
  ];
}

/** `--apply`: runs each bucket step whose state shows it undone; never touches GitHub. */
export async function applyBucket({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
}): Promise<{ label: string; done: boolean }[]> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const steps = bucketSteps(profile, repoRoot, join(repoRoot, LIFECYCLE_FILE));
  const bucket = bucketUrl(profile.brand.assetsBucket);
  const [create, ...rest] = steps;
  if (!create) throw new Error("unreachable: no bucket steps");

  const results: { label: string; done: boolean }[] = [];
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
  PROJECT_NUMBER: "gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'",
  GH_REPO: "gh repo view --json nameWithOwner -q .nameWithOwner",
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

/** `brand:push`, with `--from` when the images are not in brand-assets/ (the example profile). */
function pushCommandFor(profile: LoadedProfile, repoRoot: string): string {
  const assetsDir = selectAssetsDir(repoRoot, profile, {}, false);
  return assetsDir === join(repoRoot, PULLED_ASSETS_DIR)
    ? "pnpm brand:push"
    : `pnpm brand:push --from ${shellQuote(displayDir(repoRoot, assetsDir))}`;
}

/** Numbered steps: what, why, where, the exact lines, and how to see that it worked. */
export function formatGuide(steps: readonly GuideStep[]): string {
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
  repo,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
  repo?: string;
}): Promise<string> {
  const { projectId } = profile.brand.firebase;
  const { slug } = profile;
  const brandFile = `brand/${slug}/brand.json`;
  const bucket = bucketUrl(profile.brand.assetsBucket);
  const [create, access, versioning, lifecycle, grant] = bucketSteps(
    profile,
    repoRoot,
    LIFECYCLE_FILE,
  );
  const gcloud = (step: BucketStep | undefined) => (step ? `gcloud ${command(step.args)}` : "");
  const pushCommand = pushCommandFor(profile, repoRoot);

  // Independent read-only lookups: one wait, not three.
  const [projectNumber, ghRepo, reviewerId] = await Promise.all([
    lookup(run, "gcloud", ["projects", "describe", projectId, "--format=value(projectNumber)"]),
    repo ?? lookup(run, "gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]),
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
  const deploy =
    profile.brand.deploy ??
    defaultDeploy({ projectId, projectNumber: projectNumber ?? "<project number>" });
  const deploySnippet = JSON.stringify({ deploy }, null, 2).slice(2, -2);

  const steps: GuideStep[] = [
    {
      title: "create CD's deploy account and its keyless sign-in (once per project)",
      why: "GitHub Actions deploys as this account. No key is stored anywhere: GitHub proves it is your repo's main branch.",
      where: `your shell, signed in to gcloud as an owner of ${projectId} (gcloud auth login) and to gh as a repo admin (gh auth login). Re-running is harmless: a line that says "already exists" means that part is done.`,
      lines: [...unknownNote, section.trimEnd()],
      check: `gcloud iam service-accounts describe ${deployAccount(profile)}`,
    },
    {
      title: profile.brand.deploy
        ? `tell CD which account to use (done: ${brandFile} has it)`
        : "tell CD which account to use",
      why: "CD reads these two names from the profile; they are not secrets.",
      where: profile.brand.deploy
        ? `${brandFile} already has it: check the values match step 1`
        : `your editor: add this to ${brandFile}, then commit it`,
      lines: [deploySnippet],
      check: 'pnpm brand:doctor   (row "CD identity")',
    },
    {
      title: "create the private bucket for your logos and icons",
      why: "Deploys download your images from it, so they never enter git. Old versions are kept for rollback.",
      where:
        "your shell, as a project owner; or run pnpm brand:provision --apply, which does all of this step",
      lines: [gcloud(create), gcloud(access), gcloud(versioning), gcloud(lifecycle), gcloud(grant)],
      check: `gcloud storage buckets describe ${bucket} --format="yaml(public_access_prevention,uniform_bucket_level_access,versioning_enabled)"`,
    },
    {
      title: "upload your images",
      why: "The first deploy needs them in the bucket.",
      where: "the repo root",
      lines: [pushCommand],
      check: `gcloud storage ls "${bucket}/**"`,
    },
    {
      title: "first deploy",
      why: "Builds both sites with your profile and publishes them.",
      where: `your shell, after brand/${slug}/ and ${CONFIG_FILE} are merged to main; approve the run in GitHub`,
      lines: [deployDispatch("all")],
      check: "open both sites and follow docs/adopting.md step 10",
    },
  ];

  return [
    `Google Cloud setup for profile "${slug}" (project ${projectId}). A printout only: nothing was changed. Do the steps in order.`,
    "",
    formatGuide(steps),
  ].join("\n");
}

if (import.meta.main) {
  await runCli("brand:provision", async (profile) => {
    const argv = process.argv.slice(2);
    if (argv.includes("--apply")) {
      for (const { label, done } of await applyBucket({ profile })) {
        console.log(`brand:provision: ${label}: ${done ? "already done" : "applied"}`);
      }
      console.log(
        `brand:provision: bucket ready.\n\n${formatNext(provisionNext({ applied: true, pushCommand: pushCommandFor(profile, REPO_ROOT) }))}`,
      );
    } else {
      const repo = cliFlag("--repo", argv);
      console.log(await printProvisioning({ profile, repo }));
      console.log(`\n${formatNext(provisionNext({ applied: false }))}`);
    }
  });
}
