// Which Firebase project a tools script targets, from the selected brand profile
// (docs/specs/2026-10-22-brand-config-design.md section 5.10). Never .firebaserc.
// The brand package is imported as TypeScript through Node 24 type stripping.
import { loadProfile } from "../../../packages/brand/src/load-profile.ts";
import {
  ProjectTargetError,
  agreedProject,
  envProjectSources,
  parseProjectFlag,
} from "../../../packages/brand/src/project-target.ts";
import {
  pickSeededSiteContent,
  readSiteContent,
} from "../../../packages/brand/src/site-content.ts";

export { ProjectTargetError, loadProfile, parseProjectFlag };

/** Emulator and read-mostly scripts: the project `envKeys` name, else the profile's. GCLOUD_PROJECT
 * only by default (what `emulators:exec` sets): a shell GOOGLE_CLOUD_PROJECT must not redirect a seed. */
export function resolveLocalProject({
  env = process.env,
  profile,
  envKeys = ["GCLOUD_PROJECT"],
} = {}) {
  return (
    agreedProject(envProjectSources(env, envKeys)) ??
    (profile ?? loadProfile({ env })).brand.firebase.projectId
  );
}

/** seed-production: an explicit project that every source agrees on and the profile names. */
export function resolveProductionTarget({
  argv = process.argv.slice(2),
  env = process.env,
  profile = loadProfile({ env }),
} = {}) {
  const flag = parseProjectFlag(argv);
  const project = agreedProject([
    ...(flag ? [["--project", flag]] : []),
    ...envProjectSources(env),
  ]);
  if (!project) {
    throw new ProjectTargetError(
      "Refusing to run: name the production project with --project <id> or GCLOUD_PROJECT.",
    );
  }
  const expected = profile.brand.firebase.projectId;
  if (project !== expected) {
    throw new ProjectTargetError(
      `Refusing to run: project "${project}" is not the one profile "${profile.slug}" (${expected}) ` +
        "deploys to. Select the matching profile with BRAND_PROFILE.",
    );
  }
  return project;
}

/** The siteConfig/current fields the seeds own, from the profile's site-content.json. */
export function seededSiteContent(profile) {
  return pickSeededSiteContent(readSiteContent(profile.dir, profile.slug), profile.slug);
}
