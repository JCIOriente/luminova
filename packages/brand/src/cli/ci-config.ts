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

/** `key=value` lines; the schema rules out newlines, so each value is one output. */
export const formatOutputs = (outputs: Record<string, string>) =>
  Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

if (import.meta.main) {
  await runCli("brand:ci-config", (profile) => {
    console.log(formatOutputs(ciConfig(profile)));
  });
}
