import { BrandConfigError, type LoadedProfile } from "../load-profile.ts";
import { missingDeployProblem, undeployableProfileErrors } from "../release.ts";
import { runCli } from "./main.ts";

/**
 * What CD needs before it can sign in, read from the repo (spec C4): the profile
 * luminova.json selects, its project and its `deploy` names. The release rules apply, so
 * CD stops here, before minting any credential, on a profile that cannot ship.
 */
export function ciConfig(profile: LoadedProfile): Record<string, string> {
  const missing = missingDeployProblem(profile);
  const problems = [...undeployableProfileErrors(profile), ...(missing ? [missing] : [])];
  const { deploy, firebase } = profile.brand;
  if (problems.length > 0 || !deploy) throw new BrandConfigError(problems);
  return {
    profile: profile.slug,
    project_id: firebase.projectId,
    workload_identity_provider: deploy.workloadIdentityProvider,
    service_account: deploy.serviceAccount,
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
