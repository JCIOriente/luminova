import { BrandConfigError, type LoadedProfile } from "../load-profile.ts";
import { missingDeployProblem, undeployableProfileErrors } from "../release.ts";
import { runCli } from "./main.ts";

/**
 * What CD needs, read from the repo (spec C4): the profile brand/ selects, its project, its
 * `deploy` names, and the hosting sites and public URL the hosting job deploys to. The
 * release rules apply, so CD stops here, before minting any credential, on a profile that
 * cannot ship.
 */
export function ciConfig(profile: LoadedProfile): Record<string, string> {
  const missing = missingDeployProblem(profile);
  const problems = [...undeployableProfileErrors(profile), ...(missing ? [missing] : [])];
  const { deploy, firebase, urls } = profile.brand;
  if (problems.length > 0 || !deploy) throw new BrandConfigError(problems);
  return {
    profile: profile.slug,
    project_id: firebase.projectId,
    workload_identity_provider: deploy.workloadIdentityProvider,
    service_account: deploy.serviceAccount,
    spotlight_url: urls.spotlight,
    spotlight_site: firebase.sites.spotlight,
    backstage_site: firebase.sites.backstage,
  };
}

/**
 * `key=value` lines for $GITHUB_OUTPUT. A line break would let a value write an output of
 * its own (a project or a service account), so one is refused here, whatever the schema let
 * through.
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
    console.log(formatOutputs(ciConfig(profile)));
  });
}
