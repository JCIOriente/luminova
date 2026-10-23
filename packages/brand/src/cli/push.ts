import { join, resolve } from "node:path";
import { flagValue } from "../argv.ts";
import { contractByFolder, validateAssets } from "../assets.ts";
import { BrandConfigError, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR, undeployableProfileErrors } from "../release.ts";
import { bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { runCli } from "./main.ts";

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
}): Promise<void> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const validation = validateAssets(from, { profile: profile.slug });
  if (validation.errors.length > 0) {
    throw new BrandConfigError(validation.errors.map((error) => `${from}/${error}`));
  }
  for (const warning of validation.warnings) console.warn(`brand:push: ${warning}`);

  const bucket = profile.brand.assetsBucket;
  await Promise.all(
    [...contractByFolder()].map(([folder, paths]) =>
      run("gcloud", [
        "storage",
        "cp",
        ...paths.map((path) => join(from, path)),
        bucketUrl(bucket, folder),
      ]),
    ),
  );
}

if (import.meta.main) {
  await runCli("brand:push", async (profile) => {
    const from = resolve(
      flagValue(process.argv.slice(2), "--from", (message) => new BrandConfigError([message])) ??
        PULLED_ASSETS_DIR,
    );
    const bucket = bucketUrl(profile.brand.assetsBucket);
    console.log(
      `brand:push: uploading ${from} to ${bucket} (profile "${profile.slug}", project ${profile.brand.firebase.projectId}).`,
    );
    await push({ profile, from });
    console.log(`brand:push: done.`);
    console.log(
      `Owner step: an asset change does not trigger CD. Dispatch the hosting deploy yourself:\n  ${DEPLOY_DISPATCH}`,
    );
  });
}
