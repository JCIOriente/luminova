import { CD_PROJECT_ENV, PROJECT_VARIABLE, cdProject } from "../deploy-identity.ts";
import { BrandConfigError, brandFileLabel, type Env, type LoadedProfile } from "../load-profile.ts";
import { LOCAL_PROFILE, localLabel } from "../local-folder.ts";
import { undeployableProfileErrors } from "../release.ts";
import type { Problem } from "../remedy.ts";
import { runCli } from "./main.ts";

/**
 * What CD's later steps need from the brand brand:pull wrote into brand/local/: its project
 * and the hosting sites and public URL the hosting job deploys to. CD signed in with the
 * repository variables, so a brand of another project is refused here, before anything is
 * built or deployed; the release rules apply too.
 */
export function ciConfig(profile: LoadedProfile, env: Env): Record<string, string> {
  const { firebase, urls } = profile.brand;
  const expected = cdProject(env);
  if (!expected) {
    throw new BrandConfigError([
      `brand:ci-config runs in CD, after brand:pull: ${CD_PROJECT_ENV} is not set.`,
    ]);
  }
  const problems: Problem[] = [...undeployableProfileErrors(profile)];
  if (profile.slug !== LOCAL_PROFILE) {
    problems.push({
      message: `brand/ selects "${profile.slug}", not the ${localLabel()} brand:pull wrote: CD deploys only the brand pulled from the bucket.`,
    });
  }
  if (firebase.projectId !== expected) {
    problems.push({
      message: `${brandFileLabel(profile.slug)} names project "${firebase.projectId}", but the repository variable ${PROJECT_VARIABLE} is "${expected}": CD deploys only the brand of the project it signed in to.`,
    });
  }
  if (problems.length > 0) throw new BrandConfigError(problems);
  return {
    project_id: firebase.projectId,
    spotlight_url: urls.spotlight,
    spotlight_site: firebase.sites.spotlight,
    backstage_site: firebase.sites.backstage,
  };
}

/**
 * `key=value` lines for $GITHUB_OUTPUT. A line break would let a value write an output of
 * its own (a project or a site), so one is refused here, whatever the schema let through.
 */
export function formatOutputs(outputs: Record<string, string>): string {
  return Object.entries(outputs)
    .map(([key, value]) => {
      if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
        throw new Error(`brand:ci-config: ${key} holds a line break, so it cannot be a CD output`);
      }
      return `${key}=${value}`;
    })
    .join("\n");
}

if (import.meta.main) {
  await runCli("brand:ci-config", (profile) => {
    console.log(formatOutputs(ciConfig(profile, process.env)));
  });
}
