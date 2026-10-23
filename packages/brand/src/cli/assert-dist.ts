import { join } from "node:path";
import { BrandConfigError, REPO_ROOT } from "../load-profile.ts";
import { BRAND_APPS, type BrandApp } from "../ports.ts";
import { ProjectTargetError, agreedProject, envProjectSources } from "../project-target.ts";
import { readReleaseMarker, type ReleaseMarker } from "../release.ts";

export interface DistCheck {
  errors: string[];
  marker: ReleaseMarker | null;
  project: string | undefined;
}

/**
 * The hosting `predeploy` gate (spec section 5.6): only a release build made for the
 * project this deploy targets may ship. firebase-tools sets GCLOUD_PROJECT for hooks;
 * CD's own step passes GCP_PROJECT_ID.
 */
export function assertDist({
  distDir,
  label,
  env,
}: {
  distDir: string;
  label: string;
  env: Readonly<Record<string, string | undefined>>;
}): DistCheck {
  let marker: ReleaseMarker | null;
  let project: string | undefined;
  try {
    marker = readReleaseMarker(distDir);
    project = agreedProject(envProjectSources(env, ["GCP_PROJECT_ID"]));
  } catch (error) {
    if (error instanceof BrandConfigError) {
      return { errors: error.errors.map((e) => `${label}/${e}`), marker: null, project };
    }
    if (error instanceof ProjectTargetError)
      return { errors: [error.message], marker: null, project };
    throw error;
  }
  if (!marker) {
    return {
      errors: [
        `${label} has no release marker: it was not built with BRAND_RELEASE=1, so it cannot be deployed. Use \`pnpm deploy:hosting\` (or CD).`,
      ],
      marker,
      project,
    };
  }
  if (!project) {
    return {
      errors: [
        "brand:assert-dist cannot tell which project this deploy targets: set GCLOUD_PROJECT (firebase-tools does for hooks) or GCP_PROJECT_ID.",
      ],
      marker,
      project,
    };
  }
  if (marker.projectId !== project) {
    return {
      errors: [
        `${label} was built for "${marker.projectId}" (profile "${marker.profile}") but this deploy targets "${project}".`,
      ],
      marker,
      project,
    };
  }
  return { errors: [], marker, project };
}

function isBrandApp(value: string | undefined): value is BrandApp {
  return BRAND_APPS.some((app) => app === value);
}

if (import.meta.main) {
  const app = process.argv[2];
  if (!isBrandApp(app)) {
    console.error(`usage: brand:assert-dist <${BRAND_APPS.join("|")}>`);
    process.exit(2);
  }
  const label = `apps/${app}/dist`;
  const { errors, marker } = assertDist({
    distDir: join(REPO_ROOT, label),
    label,
    env: process.env,
  });
  if (errors.length > 0) {
    for (const error of errors) console.error(`brand:assert-dist: ${error}`);
    process.exit(1);
  }
  console.log(
    `brand:assert-dist: ${label} is a release build of "${marker?.profile}" for "${marker?.projectId}".`,
  );
}
