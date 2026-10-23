import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join, relative } from "node:path";
import {
  BrandConfigError,
  REPO_ROOT,
  loadProfile,
  readJsonFile,
  type LoadedProfile,
} from "../load-profile.ts";
import { undeployableProfileErrors } from "../release.ts";
import { CommandError, bucketUrl, runCommand, shellQuote, type CommandRunner } from "./gcloud.ts";

const LIFECYCLE_FILE = "brand/bucket-lifecycle.json";
const CI_CD_DOC = "docs/ci-cd.md";
const VIEWER_ROLE = "roles/storage.objectViewer";

interface BucketState {
  uniform_bucket_level_access?: boolean;
  public_access_prevention?: string;
  versioning_enabled?: boolean;
  lifecycle_config?: unknown;
}

interface BucketStep {
  label: string;
  args: string[];
  isDone: (state: BucketState, members: readonly string[]) => boolean;
}

export const deploySaEmail = (projectId: string) =>
  `firebase-deployer@${projectId}.iam.gserviceaccount.com`;

/** Part B steps B1–B3 (spec section 5.7), the one list both modes use. */
function bucketSteps(
  profile: LoadedProfile,
  repoRoot: string,
  lifecycleFile: string,
): BucketStep[] {
  const { projectId } = profile.brand.firebase;
  const bucket = bucketUrl(profile.brand.assetsBucket).replace(/\/$/, "");
  const member = `serviceAccount:${deploySaEmail(projectId)}`;
  const lifecycle: unknown = readJsonFile(join(repoRoot, LIFECYCLE_FILE), LIFECYCLE_FILE);
  const rule =
    typeof lifecycle === "object" && lifecycle !== null && "lifecycle" in lifecycle
      ? lifecycle.lifecycle
      : undefined;
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
      label: "uniform access, public access prevention",
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
      label: "versioning",
      args: ["storage", "buckets", "update", bucket, "--versioning"],
      isDone: (state) => state.versioning_enabled === true,
    },
    {
      label: "lifecycle (3 noncurrent generations)",
      args: ["storage", "buckets", "update", bucket, `--lifecycle-file=${lifecycleFile}`],
      isDone: (state) => isDeepStrictEqual(state.lifecycle_config, rule),
    },
    {
      label: "read-only grant to the deploy service account",
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
  try {
    const parsed: unknown = JSON.parse(
      await run("gcloud", ["storage", "buckets", "describe", bucket, "--format=json"]),
    );
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    // A missing bucket and a denied describe look alike; create then fails with the real cause.
    if (error instanceof CommandError) return null;
    throw error;
  }
}

async function viewerMembers(run: CommandRunner, bucket: string): Promise<string[]> {
  const policy: unknown = JSON.parse(
    await run("gcloud", ["storage", "buckets", "get-iam-policy", bucket, "--format=json"]),
  );
  const bindings =
    typeof policy === "object" &&
    policy !== null &&
    "bindings" in policy &&
    Array.isArray(policy.bindings)
      ? policy.bindings
      : [];
  return bindings.flatMap((binding: unknown) =>
    typeof binding === "object" &&
    binding !== null &&
    "role" in binding &&
    binding.role === VIEWER_ROLE &&
    "members" in binding &&
    Array.isArray(binding.members)
      ? binding.members.filter((member: unknown) => typeof member === "string")
      : [],
  );
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
  const bucket = bucketUrl(profile.brand.assetsBucket).replace(/\/$/, "");
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

async function lookup(run: CommandRunner, command: "gcloud" | "gh", args: string[], hint: string) {
  try {
    return (await run(command, args)).trim() || `<${hint}>`;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    return `<${hint}>`;
  }
}

const command = (args: readonly string[]) => args.map(shellQuote).join(" ");

/** Default mode: prints part B and the section 6 block with the profile's values. Read-only. */
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
  const bucket = bucketUrl(profile.brand.assetsBucket).replace(/\/$/, "");
  const [create, access, versioning, lifecycle, grant] = bucketSteps(
    profile,
    repoRoot,
    LIFECYCLE_FILE,
  );
  const gcloud = (step: BucketStep | undefined) => (step ? `gcloud ${command(step.args)}` : "");
  const profileAssets = relative(repoRoot, join(profile.dir, "assets"));

  const values: Record<string, string> = {
    PROJECT_ID: projectId,
    PROJECT_NUMBER: await lookup(
      run,
      "gcloud",
      ["projects", "describe", projectId, "--format=value(projectNumber)"],
      `project number: gcloud projects describe ${projectId} --format='value(projectNumber)'`,
    ),
    GH_REPO:
      repo ??
      (await lookup(
        run,
        "gh",
        ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        "owner/repo: gh repo view --json nameWithOwner -q .nameWithOwner",
      )),
    REVIEWER_ID: await lookup(
      run,
      "gh",
      ["api", "user", "-q", ".id"],
      "your GitHub user id: gh api user -q .id",
    ),
  };
  const section = provisioningSection(readFileSync(join(repoRoot, CI_CD_DOC), "utf8")).replace(
    /^export (PROJECT_ID|PROJECT_NUMBER|GH_REPO|REVIEWER_ID)=.*$/gm,
    (_, key: string) => `export ${key}=${values[key] ?? ""}`,
  );

  return [
    `# Brand asset bucket for profile "${slug}" (project ${projectId}). Owner-only: Claude never runs these.`,
    "# B1-B3 equal `pnpm brand:provision --apply`; either path is fine.",
    "",
    "# B1: create the bucket",
    gcloud(create),
    "# B2: versioning and lifecycle (also enforces access on a bucket created elsewhere)",
    gcloud(access),
    gcloud(versioning),
    gcloud(lifecycle),
    "# B3: read-only grant for CD, then check it",
    gcloud(grant),
    `gcloud iam roles describe ${VIEWER_ROLE} --format="value(includedPermissions)"`,
    `gcloud storage buckets describe ${bucket} --format="yaml(public_access_prevention,uniform_bucket_level_access,versioning_enabled,lifecycle_config)"`,
    `gcloud storage buckets get-iam-policy ${bucket}`,
    "# B4: upload the assets",
    `BRAND_PROFILE=${slug} pnpm brand:push --from ${profileAssets}`,
    `gcloud storage ls -a "${bucket}/**"`,
    "# B5: the CD variable",
    `gh variable set BRAND_PROFILE --env production --body ${slug}`,
    "# B6, after the release PR merges: deploy and verify",
    "gh workflow run deploy.yml -f surface=all",
    "",
    `# First-time CD setup for this project (${CI_CD_DOC} section 6, values filled in):`,
    section,
  ].join("\n");
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  try {
    const profile = loadProfile();
    for (const warning of profile.warnings) console.warn(`brand:provision: ${warning}`);
    if (argv.includes("--apply")) {
      for (const { label, done } of await applyBucket({ profile })) {
        console.log(`brand:provision: ${label}: ${done ? "already done" : "applied"}`);
      }
      console.log(
        `brand:provision: bucket ready. Remaining owner steps: B4 (BRAND_PROFILE=${profile.slug} pnpm brand:push) and B5; run without --apply to print them.`,
      );
    } else {
      const repoIndex = argv.indexOf("--repo");
      const repo = repoIndex === -1 ? undefined : argv[repoIndex + 1];
      console.log(await printProvisioning({ profile, repo }));
    }
  } catch (error) {
    if (!(error instanceof BrandConfigError || error instanceof CommandError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
