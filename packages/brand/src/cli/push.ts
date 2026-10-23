import { join, resolve } from "node:path";
import { validateAssets } from "../assets.ts";
import { BrandConfigError, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR, undeployableProfileErrors } from "../release.ts";
import { CommandError, bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { contractByDirectory } from "./pull.ts";

/** An asset change does not trigger CD, which diffs git; the owner dispatches it. */
export const DEPLOY_DISPATCH = "gh workflow run deploy.yml -f surface=hosting";

/**
 * Uploads a validated asset set to the selected profile's bucket (owner/adopter only).
 * Plain `cp` per file: never a sync that deletes, so a partial source cannot erase
 * objects, and versioning keeps every overwritten generation for rollback.
 */
export async function push({
  profile,
  from,
  run = runCommand,
}: {
  profile: LoadedProfile;
  from: string;
  run?: CommandRunner;
}): Promise<{ bucket: string; uploaded: number; dispatch: string }> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const validation = validateAssets(from, { profile: profile.slug });
  if (validation.errors.length > 0) {
    throw new BrandConfigError(validation.errors.map((error) => `${from}/${error}`));
  }
  for (const warning of validation.warnings) console.warn(`brand:push: ${warning}`);

  const bucket = profile.brand.assetsBucket;
  let uploaded = 0;
  for (const [dir, paths] of contractByDirectory()) {
    const files = paths.map((path) => join(from, path));
    await run("gcloud", ["storage", "cp", ...files, bucketUrl(bucket, dir ? `${dir}/` : "")]);
    uploaded += files.length;
  }
  return { bucket, uploaded, dispatch: DEPLOY_DISPATCH };
}

function parseFrom(argv: readonly string[]): string {
  const index = argv.indexOf("--from");
  if (index === -1) return PULLED_ASSETS_DIR;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new BrandConfigError(["--from needs a directory."]);
  return value;
}

if (import.meta.main) {
  try {
    const profile = loadProfile();
    const from = resolve(parseFrom(process.argv.slice(2)));
    console.log(
      `brand:push: uploading ${from} to gs://${profile.brand.assetsBucket} (profile "${profile.slug}", project ${profile.brand.firebase.projectId}).`,
    );
    const result = await push({ profile, from });
    console.log(`brand:push: ${result.uploaded} files uploaded to gs://${result.bucket}.`);
    console.log(
      `Owner step: an asset change does not trigger CD. Dispatch the hosting deploy yourself:\n  ${result.dispatch}`,
    );
  } catch (error) {
    if (!(error instanceof BrandConfigError || error instanceof CommandError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
