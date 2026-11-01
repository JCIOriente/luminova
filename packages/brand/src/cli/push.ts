import { join } from "node:path";
import { fileSha256 } from "../hash.ts";
import {
  BrandConfigError,
  REPO_ROOT,
  copyChapterRemedy,
  errorMessage,
  type LoadedProfile,
} from "../load-profile.ts";
import {
  BUCKET_CONTRACT,
  LOCAL_PROFILE,
  localDir,
  localLabel,
  readManifest,
  writeManifest,
  type ObjectRecord,
} from "../local-folder.ts";
import { undeployableProfileErrors } from "../release.ts";
import { formatNext, type Problem, type Remedy } from "../remedy.ts";
import {
  CommandError,
  bucketUrl,
  listBucket,
  runCommand,
  type CommandFailureKind,
  type CommandRunner,
} from "./gcloud.ts";
import { checkImages, type Images } from "./images.ts";
import { runCli } from "./main.ts";
import { formatReport, formatSections } from "./rows.ts";
import { plural } from "./table.ts";

/** With the fork's owner/name when known: gh's default repository may be upstream. */
export const deployDispatch = (surface: "hosting" | "all", repo: string | null = null) =>
  `gh workflow run deploy.yml -f surface=${surface}${repo ? ` --repo ${repo}` : ""}`;

/** A brand change does not trigger CD, which diffs git; the owner dispatches it. */
export const DEPLOY_DISPATCH = deployDispatch("hosting");

export const PUSH_NEXT: readonly Remedy[] = [
  {
    change: "deploy the sites with this brand from your fork (CD does not notice the bucket)",
    run: DEPLOY_DISPATCH,
    where: "shell",
  },
];

/** The images have problems: nothing was uploaded. Carries brand:check's images section. */
export class ImagesNotReadyError extends Error {
  readonly images: Images;

  constructor(images: Images) {
    super(`${images.title}: not ready`);
    this.images = images;
  }
}

/**
 * TRANSITIONAL (the JCI Oriente removal PR drops this): the bucket mirrors brand/local/, so a
 * profile committed in brand/<slug>/ is copied there first (owner runbook step 1).
 */
function committedChapterProblem({ slug }: LoadedProfile): Problem | null {
  if (slug === LOCAL_PROFILE) return null;
  return {
    message: `brand:push uploads ${localLabel()}, but the selected profile is committed in brand/${slug}/.`,
    remedies: [copyChapterRemedy(slug, `copy it into ${localLabel()}, then run brand:push again`)],
  };
}

/**
 * Uploads brand/local/'s 17 contract files to the profile's bucket (spec "brand:push"), once
 * the images pass brand:check's rules. Each `cp` is conditional on the generation the
 * manifest recorded (0, create-only, for a file never pushed to this bucket), so nobody
 * overwrites a newer upload unnoticed; then the manifest records what went up. Plain `cp`
 * per file: never a sync that deletes, and versioning keeps every overwritten generation.
 */
export async function push({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
}): Promise<Images> {
  const refused = undeployableProfileErrors(profile);
  const committed = committedChapterProblem(profile);
  if (committed) refused.push(committed);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const images = checkImages({ profile, repoRoot });
  if (images.validation.errors.length > 0) throw new ImagesNotReadyError(images);

  const dir = localDir(repoRoot);
  const bucket = profile.brand.assetsBucket;
  const previous = readManifest(dir);
  const sameBucket = previous?.bucket === bucket;
  const generationOf = (path: string) => {
    const record = sameBucket ? previous.objects[path] : undefined;
    return record?.source === "bucket" ? record.generation : "0";
  };
  const results = await Promise.allSettled(
    BUCKET_CONTRACT.map((path) =>
      run("gcloud", [
        "storage",
        "cp",
        `--if-generation-match=${generationOf(path)}`,
        join(dir, path),
        bucketUrl(bucket, path),
      ]),
    ),
  );
  const uploaded = new Set<string>();
  const conflicts: string[] = [];
  const failed = new Map<CommandFailureKind, unknown[]>();
  results.forEach((result, index) => {
    const path = BUCKET_CONTRACT[index] ?? "";
    if (result.status === "fulfilled") uploaded.add(path);
    else if (result.reason instanceof CommandError && result.reason.kind === "precondition") {
      conflicts.push(path);
    } else {
      const kind = result.reason instanceof CommandError ? result.reason.kind : "other";
      failed.set(kind, [...(failed.get(kind) ?? []), result.reason]);
    }
  });

  if (uploaded.size > 0) {
    const generations = await listBucket(run, bucket);
    const objects: Record<string, ObjectRecord> = {};
    for (const path of BUCKET_CONTRACT) {
      const generation = generations.get(path);
      const kept = sameBucket ? previous.objects[path] : undefined;
      if (uploaded.has(path) && generation !== undefined) {
        objects[path] = { source: "bucket", generation, sha256: fileSha256(join(dir, path)) };
      } else if (kept) {
        objects[path] = kept;
      }
    }
    writeManifest(dir, {
      version: 1,
      project: profile.brand.firebase.projectId,
      bucket,
      objects,
    });
  }
  if (conflicts.length === 0) {
    const first = [...failed.values()][0]?.[0];
    if (first !== undefined) throw first;
    return images;
  }
  // The conflicts say what to do; every other kind of failure is reported with them.
  const others = [...failed.values()].map((reasons) => {
    const [first] = reasons;
    const more = reasons.length - 1;
    const text = errorMessage(first);
    return {
      message: more > 0 ? `${text} (and ${plural(more, "more upload")} failed the same way)` : text,
      remedies: first instanceof CommandError ? first.remedies : [],
    };
  });
  throw new BrandConfigError(
    [
      ...conflicts.map(
        (path) =>
          `${bucketUrl(bucket, path)}: changed in the bucket since your last pull or push (another upload), so it was not replaced`,
      ),
      ...others,
    ],
    [
      {
        change: "download the bucket's copy first (it asks before replacing your changed files)",
        run: "pnpm brand:pull",
      },
      { change: "then upload again", run: "pnpm brand:push" },
    ],
  );
}

if (import.meta.main) {
  await runCli("brand:push", async (profile) => {
    const bucket = bucketUrl(profile.brand.assetsBucket);
    let images: Images;
    try {
      images = await push({ profile });
    } catch (error) {
      if (!(error instanceof ImagesNotReadyError)) throw error;
      const { text, failures } = formatReport([error.images]);
      console.error(`${text}\n\nbrand:push: nothing uploaded, ${plural(failures, "problem")}.`);
      process.exit(1);
    }
    console.log(
      `${formatSections([images])}\n\nbrand:push: uploaded ${localLabel()} (brand.toml and ${images.validation.files.length} images) to ${bucket} (project ${profile.brand.firebase.projectId}).\n\n${formatNext(PUSH_NEXT)}`,
    );
  });
}
