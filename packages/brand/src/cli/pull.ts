import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT, PULL_MANIFEST_FILE, contractByFolder, validateAssets } from "../assets.ts";
import {
  BrandConfigError,
  REPO_ROOT,
  issuesToBrandError,
  parseJsonText,
  type LoadedProfile,
} from "../load-profile.ts";
import { PULLED_ASSETS_DIR, undeployableProfileErrors } from "../release.ts";
import { formatNext, type Remedy } from "../remedy.ts";
import { bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { runCli } from "./main.ts";

const listingSchema = z.array(
  z.looseObject({
    name: z.string(),
    generation: z.union([z.string(), z.number()]).transform(String),
    md5_hash: z.string().optional(),
  }),
);

export interface PullManifest {
  profile: string;
  bucket: string;
  objects: { name: string; generation: string; md5: string | undefined }[];
}

export const PULL_NEXT: readonly Remedy[] = [
  { change: "check the downloaded images as a deploy would", run: "pnpm brand:check --release" },
];

/**
 * Downloads the selected profile's contract files from its bucket into `brand-assets/`
 * (spec section 5.7). Downloads land in a scratch dir and replace `brand-assets/` only
 * once the whole set validates, so a failed pull leaves the previous set in place.
 */
export async function pull({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
}): Promise<PullManifest> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const bucket = profile.brand.assetsBucket;
  const label = `gcloud listing of ${bucketUrl(bucket)}`;
  // gs://bucket alone lists one directory level; ** reaches spotlight/ and backstage/.
  const raw = await run("gcloud", [
    "storage",
    "objects",
    "list",
    bucketUrl(bucket, "**"),
    "--format=json",
  ]);
  const listing = listingSchema.safeParse(parseJsonText(raw, label));
  if (!listing.success) throw issuesToBrandError(label, listing.error.issues);
  const byName = new Map(listing.data.map((object) => [object.name, object]));

  const objects: PullManifest["objects"] = [];
  const missing: string[] = [];
  for (const { path } of ASSET_CONTRACT) {
    const object = byName.get(path);
    if (object) objects.push({ name: path, generation: object.generation, md5: object.md5_hash });
    else
      missing.push(
        `${bucketUrl(bucket, path)}: missing from the bucket (upload it with brand:push)`,
      );
  }
  if (missing.length > 0) {
    throw new BrandConfigError(missing, [
      { change: "upload the full set to the bucket (project owner)", run: "pnpm brand:push" },
    ]);
  }
  const generationOf = new Map(objects.map(({ name, generation }) => [name, generation]));

  const cacheDir = join(repoRoot, "node_modules", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  const staging = mkdtempSync(join(cacheDir, "luminova-brand-pull-"));
  try {
    // One cp per folder: the destinations differ, and the folders download in parallel.
    await Promise.all(
      [...contractByFolder()].map(([folder, paths]) => {
        const target = join(staging, folder);
        mkdirSync(target, { recursive: true });
        const sources = paths.map((path) => `${bucketUrl(bucket, path)}#${generationOf.get(path)}`);
        return run("gcloud", ["storage", "cp", ...sources, `${target}/`]);
      }),
    );

    const manifest: PullManifest = { profile: profile.slug, bucket, objects };
    writeFileSync(join(staging, PULL_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    const validation = validateAssets(staging, { profile: profile.slug });
    if (validation.errors.length > 0) {
      throw new BrandConfigError(
        validation.errors.map((error) => bucketUrl(bucket, error)),
        [
          {
            change: "replace the bad files: brand:push checks a set before uploading it",
            run: "pnpm brand:push --from <folder with the fixed set>",
          },
        ],
      );
    }

    const target = join(repoRoot, PULLED_ASSETS_DIR);
    rmSync(target, { recursive: true, force: true });
    renameSync(staging, target);
    return manifest;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await runCli("brand:pull", async (profile) => {
    const manifest = await pull({ profile });
    console.error(
      `brand:pull: ${manifest.objects.length} files from ${bucketUrl(manifest.bucket)} into ${PULLED_ASSETS_DIR}/ for profile "${manifest.profile}".`,
    );
    for (const { name, generation } of manifest.objects) console.error(`  ${name}#${generation}`);
    console.error(`\n${formatNext(PULL_NEXT)}`);
  });
}
