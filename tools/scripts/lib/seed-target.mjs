// Which Firebase project a tools script targets, from the selected brand profile
// (docs/specs/2026-10-22-brand-config-design.md section 5.10). Never .firebaserc.
// The brand package is imported as TypeScript through Node 24 type stripping.
import { loadProfile } from "../../../packages/brand/src/load-profile.ts";
import {
  pickSeededSiteContent,
  readSiteContent,
} from "../../../packages/brand/src/site-content.ts";

export class SeedTargetError extends Error {
  name = "SeedTargetError";
}

export { loadProfile };

/** Emulator and read-mostly scripts: the first env key set, else the profile's project. */
export function resolveLocalProject({
  env = process.env,
  profile = loadProfile({ env }),
  envKeys = ["GCLOUD_PROJECT"],
} = {}) {
  const fromEnv = envKeys.map((key) => env[key]?.trim()).find(Boolean);
  return fromEnv || profile.brand.firebase.projectId;
}

export function parseProjectFlag(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--project=")) return argv[i].slice("--project=".length);
    if (argv[i] === "--project") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new SeedTargetError("--project needs an id.");
      return value;
    }
  }
  return undefined;
}

/** seed-production: an explicit project that every source agrees on and the profile names. */
export function resolveProductionTarget({
  argv = process.argv.slice(2),
  env = process.env,
  profile = loadProfile({ env }),
} = {}) {
  const sources = [
    ["--project", parseProjectFlag(argv)],
    ["GCLOUD_PROJECT", env.GCLOUD_PROJECT?.trim()],
    ["GOOGLE_CLOUD_PROJECT", env.GOOGLE_CLOUD_PROJECT?.trim()],
  ].filter(([, value]) => value);
  if (sources.length === 0) {
    throw new SeedTargetError(
      "Refusing to run: name the production project with --project <id> or GCLOUD_PROJECT.",
    );
  }
  const projects = new Set(sources.map(([, value]) => value));
  if (projects.size > 1) {
    throw new SeedTargetError(
      `Refusing to run: the project sources disagree (${sources.map(([key, value]) => `${key}=${value}`).join(", ")}).`,
    );
  }
  const [project] = projects;
  const expected = profile.brand.firebase.projectId;
  if (project !== expected) {
    throw new SeedTargetError(
      `Refusing to run: project "${project}" is not the one profile "${profile.slug}" (${expected}) ` +
        "deploys to. Select the matching profile with BRAND_PROFILE.",
    );
  }
  return project;
}

/** The siteConfig/current fields the seeds own, from the profile's site-content.json. */
export function seededSiteContent(profile) {
  return pickSeededSiteContent(readSiteContent(profile.dir, profile.slug));
}
