import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT, PULL_MANIFEST_FILE, validateAssets } from "../assets.ts";
import {
  BrandConfigError,
  REPO_ROOT,
  issuesToBrandError,
  loadProfile,
  type LoadedProfile,
} from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";

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

/** Contract paths grouped by directory, root first: one `gcloud storage cp` per group. */
export function contractByDirectory(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const { path } of ASSET_CONTRACT) {
    const dir = dirname(path) === "." ? "" : dirname(path);
    groups.set(dir, [...(groups.get(dir) ?? []), path]);
  }
  return groups;
}

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
  const bucket = profile.brand.assetsBucket;
  // gs://bucket alone lists one directory level; ** reaches spotlight/ and backstage/.
  const raw = await run("gcloud", [
    "storage",
    "objects",
    "list",
    bucketUrl(bucket, "**"),
    "--format=json",
  ]);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new BrandConfigError([`gcloud listing of gs://${bucket}: not JSON (${String(error)})`]);
  }
  const listing = listingSchema.safeParse(json);
  if (!listing.success)
    throw issuesToBrandError(`gcloud listing of gs://${bucket}`, listing.error.issues);
  const byName = new Map(listing.data.map((object) => [object.name, object]));

  const missing = ASSET_CONTRACT.filter(({ path }) => !byName.has(path));
  if (missing.length > 0) {
    throw new BrandConfigError(
      missing.map(
        ({ path }) =>
          `${bucketUrl(bucket, path)}: missing from the bucket (upload it with brand:push)`,
      ),
    );
  }

  const cacheDir = join(repoRoot, "node_modules", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  const staging = mkdtempSync(join(cacheDir, "luminova-brand-pull-"));
  try {
    const objects = ASSET_CONTRACT.map(({ path }) => {
      const object = byName.get(path);
      if (!object) throw new Error(`unreachable: ${path} was checked above`);
      return { name: object.name, generation: object.generation, md5: object.md5_hash };
    });
    const generationOf = new Map(objects.map(({ name, generation }) => [name, generation]));
    for (const [dir, paths] of contractByDirectory()) {
      const target = join(staging, dir);
      mkdirSync(target, { recursive: true });
      const sources = paths.map(
        (path) => `${bucketUrl(bucket, path)}#${generationOf.get(path) ?? ""}`,
      );
      await run("gcloud", ["storage", "cp", ...sources, `${target}/`]);
    }

    const manifest: PullManifest = { profile: profile.slug, bucket, objects };
    writeFileSync(join(staging, PULL_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    const validation = validateAssets(staging, { profile: profile.slug });
    if (validation.errors.length > 0) {
      throw new BrandConfigError(validation.errors.map((error) => `gs://${bucket}/${error}`));
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
  try {
    const profile = loadProfile();
    for (const warning of profile.warnings) console.warn(`brand:pull: ${warning}`);
    const manifest = await pull({ profile });
    console.log(
      `brand:pull: ${manifest.objects.length} files from gs://${manifest.bucket} into ${PULLED_ASSETS_DIR}/ for profile "${manifest.profile}".`,
    );
    for (const { name, generation } of manifest.objects) console.log(`  ${name}#${generation}`);
  } catch (error) {
    if (!(error instanceof BrandConfigError || error instanceof CommandError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
