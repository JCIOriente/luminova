import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BrandConfigError, REPO_ROOT } from "../load-profile.ts";
import { BRAND_APPS, type BrandApp } from "../ports.ts";
import { ProjectTargetError, agreedProject, envProjectSources } from "../project-target.ts";
import { readReleaseMarker, type ReleaseMarker } from "../release.ts";
import { sha256 } from "../hash.ts";

/** Errors, or the marker of a dist that may ship. */
export type DistCheck =
  { errors: string[]; marker?: undefined } | { errors: []; marker: ReleaseMarker };

const refuse = (...errors: string[]): DistCheck => ({ errors });

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
    // firebase-tools sets GCLOUD_PROJECT for hooks; a shell GOOGLE_CLOUD_PROJECT is ignored.
    project = agreedProject(envProjectSources(env, ["GCLOUD_PROJECT", "GCP_PROJECT_ID"]));
  } catch (error) {
    if (error instanceof BrandConfigError)
      return refuse(...error.errors.map((e) => `${label}/${e}`));
    if (error instanceof ProjectTargetError) return refuse(error.message);
    throw error;
  }
  if (!marker) {
    return refuse(
      `${label} has no release marker: it was not built with BRAND_RELEASE=1, so it cannot be deployed. Use \`pnpm deploy:hosting\` (or CD).`,
    );
  }
  if (!project) {
    return refuse(
      "brand:assert-dist cannot tell which project this deploy targets: set GCLOUD_PROJECT (firebase-tools does for hooks) or GCP_PROJECT_ID.",
    );
  }
  if (marker.projectId !== project) {
    return refuse(
      `${label} was built for "${marker.projectId}" (profile "${marker.profile}") but this deploy targets "${project}".`,
    );
  }
  const indexHtml = join(distDir, "index.html");
  if (!existsSync(indexHtml) || sha256(readFileSync(indexHtml)) !== marker.indexHtml) {
    return refuse(
      `${label}/index.html is not the one this marker was written for: the dist was rebuilt (or restored from turbo's cache) without BRAND_RELEASE=1. Rebuild with \`pnpm deploy:hosting\`.`,
    );
  }
  return { errors: [], marker };
}

function isBrandApp(value: string | undefined): value is BrandApp {
  return BRAND_APPS.some((app) => app === value);
}

/** stderr only: firebase-tools merges a hook's stdout into its `--json` output. */
export function main(
  app: string | undefined,
  { root = REPO_ROOT, env = process.env }: { root?: string; env?: NodeJS.ProcessEnv } = {},
): number {
  if (!isBrandApp(app)) {
    console.error(`usage: brand:assert-dist <${BRAND_APPS.join("|")}>`);
    return 2;
  }
  const label = `apps/${app}/dist`;
  const { errors, marker } = assertDist({ distDir: join(root, label), label, env });
  if (!marker) {
    for (const error of errors) console.error(`brand:assert-dist: ${error}`);
    return 1;
  }
  console.error(
    `brand:assert-dist: ${label} is a release build of "${marker.profile}" for "${marker.projectId}".`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv[2]));
}
