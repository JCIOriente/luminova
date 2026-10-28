import { join } from "node:path";
import { contractByFolder } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, type Env, type LoadedProfile } from "../load-profile.ts";
import { displayDir, undeployableProfileErrors } from "../release.ts";
import { formatNext, formatRemedies, type Remedy, guideStep } from "../remedy.ts";
import { bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { checkImages, type Images } from "./images.ts";
import { runCli } from "./main.ts";
import { formatSections, rowRemedies } from "./rows.ts";
import { plural } from "./table.ts";

export const deployDispatch = (surface: "hosting" | "all") =>
  `gh workflow run deploy.yml -f surface=${surface}`;

/** An asset change does not trigger CD, which diffs git; the owner dispatches it. */
export const DEPLOY_DISPATCH = deployDispatch("hosting");

export const pushNext = (slug: string): Remedy[] => [
  { change: "confirm the bucket row passes", run: "pnpm brand:check" },
  {
    change: `when you are ready to go live: merge brand/${slug}/ to main; the first deploy ships everything (${guideStep("goLive")}). Already on main? Deploy by hand:`,
    run: deployDispatch("all"),
    where: "shell",
  },
  {
    change:
      "later image changes: redeploy the sites only (CD does not notice images, they are not in git)",
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
 * Uploads the images `brand:check` reads to the selected profile's bucket (owner/adopter
 * only), once they all pass. Plain `cp` per file: never a sync that deletes, so a partial
 * source cannot erase objects, and versioning keeps every overwritten generation for rollback.
 */
export async function push({
  profile,
  repoRoot = REPO_ROOT,
  env = process.env,
  run = runCommand,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  env?: Env;
  run?: CommandRunner;
}): Promise<Images> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const images = checkImages({ profile, repoRoot, env });
  if (images.validation.errors.length > 0) throw new ImagesNotReadyError(images);

  const bucket = profile.brand.assetsBucket;
  await Promise.all(
    [...contractByFolder()].map(([folder, paths]) =>
      run("gcloud", [
        "storage",
        "cp",
        ...paths.map((path) => join(images.dir, path)),
        bucketUrl(bucket, folder),
      ]),
    ),
  );
  return images;
}

if (import.meta.main) {
  await runCli("brand:push", {}, async (profile) => {
    const bucket = bucketUrl(profile.brand.assetsBucket);
    let images: Images;
    try {
      images = await push({ profile });
    } catch (error) {
      if (!(error instanceof ImagesNotReadyError)) throw error;
      const { rows } = error.images;
      const problems = rows.filter(({ status }) => status === "fail").length;
      console.error(
        `${formatSections([error.images])}\n\n${formatRemedies(rowRemedies(rows))}\n\nbrand:push: nothing uploaded, ${plural(problems, "problem")}.`,
      );
      process.exit(1);
    }
    console.log(
      `${formatSections([images])}\n\nbrand:push: uploaded ${displayDir(REPO_ROOT, images.dir)}/ to ${bucket} (profile "${profile.slug}", project ${profile.brand.firebase.projectId}).\n\n${formatNext(pushNext(profile.slug))}`,
    );
  });
}
