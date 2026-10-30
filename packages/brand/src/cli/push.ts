import { join } from "node:path";
import { z } from "zod";
import {
  BrandConfigError,
  REPO_ROOT,
  brandFileLabel,
  issuesToBrandError,
  parseJsonText,
  type LoadedProfile,
} from "../load-profile.ts";
import {
  BUCKET_CONTRACT,
  LOCAL_PROFILE,
  fileHashes,
  localDir,
  localLabel,
  readManifest,
  writeManifest,
  type ObjectRecord,
} from "../local-folder.ts";
import { undeployableProfileErrors } from "../release.ts";
import { formatNext, type Problem, type Remedy } from "../remedy.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { checkImages, type Images } from "./images.ts";
import { runCli } from "./main.ts";
import { formatReport, formatSections } from "./rows.ts";
import { plural } from "./table.ts";

export const deployDispatch = (surface: "hosting" | "all") =>
  `gh workflow run deploy.yml -f surface=${surface}`;

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

const listingSchema = z.array(
  z.looseObject({
    name: z.string(),
    generation: z.union([z.string(), z.number()]).transform(String),
  }),
);

/**
 * TRANSITIONAL (the JCI Oriente removal PR drops it): the bucket mirrors brand/local/, so a
 * profile committed in brand/<slug>/ is copied there first (owner runbook step 1).
 */
function committedChapterProblem({ slug }: LoadedProfile): Problem | null {
  if (slug === LOCAL_PROFILE) return null;
  return {
    message: `brand:push uploads ${localLabel()}, but the selected profile is committed in brand/${slug}/.`,
    remedies: [
      {
        change: `copy it into ${localLabel()}, then run brand:push again`,
        run: `cp ${brandFileLabel(slug)} ${localLabel("brand.toml")}`,
      },
    ],
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
  const generationOf = (path: string) =>
    (sameBucket ? previous.objects[path]?.generation : undefined) ?? "0";
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
  const uploaded = BUCKET_CONTRACT.filter((_, index) => results[index]?.status === "fulfilled");
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (uploaded.length > 0) {
    const label = `gcloud listing of ${bucketUrl(bucket)}`;
    const raw = await run("gcloud", [
      "storage",
      "objects",
      "list",
      bucketUrl(bucket, "**"),
      "--format=json",
    ]);
    const listing = listingSchema.safeParse(parseJsonText(raw, label));
    if (!listing.success) throw issuesToBrandError(label, listing.error.issues);
    const generations = new Map(listing.data.map(({ name, generation }) => [name, generation]));
    const objects: Record<string, ObjectRecord> = {};
    for (const path of BUCKET_CONTRACT) {
      const kept = sameBucket ? previous.objects[path] : undefined;
      if (uploaded.includes(path)) {
        objects[path] = {
          generation: generations.get(path),
          ...fileHashes(join(dir, path)),
          source: "bucket",
        };
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
  const conflicts = BUCKET_CONTRACT.filter((_, index) => {
    const result = results[index];
    return (
      result?.status === "rejected" &&
      result.reason instanceof CommandError &&
      result.reason.kind === "precondition"
    );
  });
  if (conflicts.length > 0) {
    throw new BrandConfigError(
      conflicts.map(
        (path) =>
          `${bucketUrl(bucket, path)}: changed in the bucket since your last pull or push (another upload), so it was not replaced`,
      ),
      [
        {
          change: "download the bucket's copy first (it asks before replacing your changed files)",
          run: "pnpm brand:pull",
        },
        { change: "then upload again", run: "pnpm brand:push" },
      ],
    );
  }
  const [failure] = failures;
  if (failure !== undefined) throw failure;
  return images;
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
