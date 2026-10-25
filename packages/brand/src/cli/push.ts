import { join, resolve } from "node:path";
import { flagValue } from "../argv.ts";
import { assetRemedies, contractByFolder, validateAssets } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR, displayDir, undeployableProfileErrors } from "../release.ts";
import { formatNext, type Remedy } from "../remedy.ts";
import { bucketUrl, runCommand, shellQuote, type CommandRunner } from "./gcloud.ts";
import { runCli } from "./main.ts";

export const deployDispatch = (surface: "hosting" | "all") =>
  `gh workflow run deploy.yml -f surface=${surface}`;

/** An asset change does not trigger CD, which diffs git; the owner dispatches it. */
export const DEPLOY_DISPATCH = deployDispatch("hosting");

export const PUSH_NEXT: readonly Remedy[] = [
  {
    change: "first deploy of this project: every surface (docs/adopting.md step 11, after step 10)",
    run: deployDispatch("all"),
    where: "shell",
  },
  {
    change:
      "or, for a later asset change, hosting only: CD does not see assets, they are not in git",
    run: DEPLOY_DISPATCH,
    where: "shell",
  },
  { change: "confirm the bucket row", run: "pnpm brand:doctor" },
];

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
    throw new BrandConfigError(
      validation.errors.map((error) => `${from}/${error}`),
      assetRemedies(
        validation,
        displayDir(REPO_ROOT, from),
        `BRAND_ASSETS_DIR=${shellQuote(from)} pnpm brand:check`,
      ),
    );
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
    await push({ profile, from });
    console.log(
      `brand:push: uploaded ${from} to ${bucket} (profile "${profile.slug}", project ${profile.brand.firebase.projectId}).\n\n${formatNext(PUSH_NEXT)}`,
    );
  });
}
