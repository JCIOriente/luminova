import { join, resolve } from "node:path";
import { assetRemedies, contractByFolder, validateAssets } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, type LoadedProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR, displayDir, undeployableProfileErrors } from "../release.ts";
import { formatNext, type Remedy } from "../remedy.ts";
import { bucketUrl, runCommand, shellQuote, type CommandRunner } from "./gcloud.ts";
import { cliFlag, runCli } from "./main.ts";

export const deployDispatch = (surface: "hosting" | "all") =>
  `gh workflow run deploy.yml -f surface=${surface}`;

/** An asset change does not trigger CD, which diffs git; the owner dispatches it. */
export const DEPLOY_DISPATCH = deployDispatch("hosting");

export const pushNext = (slug: string): Remedy[] => [
  {
    change: `first deploy of everything (rules, functions, both sites), once brand/${slug}/ and luminova.json are on main (docs/adopting.md step 10)`,
    run: deployDispatch("all"),
    where: "shell",
  },
  {
    change:
      "later image changes: redeploy the sites only (CD does not notice images, they are not in git)",
    run: DEPLOY_DISPATCH,
    where: "shell",
  },
  { change: "confirm the bucket row passes", run: "pnpm brand:doctor" },
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
      assetRemedies(validation, displayDir(REPO_ROOT, from), {
        checkCommand: `pnpm brand:check --assets ${shellQuote(displayDir(REPO_ROOT, from))}`,
      }),
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
    const from = resolve(cliFlag("--from") ?? PULLED_ASSETS_DIR);
    const bucket = bucketUrl(profile.brand.assetsBucket);
    await push({ profile, from });
    console.log(
      `brand:push: uploaded ${from} to ${bucket} (profile "${profile.slug}", project ${profile.brand.firebase.projectId}).\n\n${formatNext(pushNext(profile.slug))}`,
    );
  });
}
