import { BrandConfigError, type LoadedProfile } from "../load-profile.ts";
import { undeployableProfileErrors } from "../release.ts";
import { runCli } from "./main.ts";

/**
 * What CD needs before it can sign in, read from the repo (spec C4): the profile
 * luminova.json selects, its project and its `deploy` names. The release rules apply, so
 * CD stops here, before minting any credential, on a profile that cannot ship.
 */
export function ciConfig(profile: LoadedProfile): Record<string, string> {
  const problems = undeployableProfileErrors(profile);
  const { deploy, firebase } = profile.brand;
  if (!deploy) {
    problems.push({
      message: `brand/${profile.slug}/brand.json has no "deploy" section: CD cannot sign in to Google Cloud.`,
      remedies: [
        {
          change: `add "deploy" to brand/${profile.slug}/brand.json (step 2 of this prints it with your values), commit and merge it`,
          run: "pnpm brand:provision",
        },
      ],
    });
  }
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
