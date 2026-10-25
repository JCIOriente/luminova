/**
 * The names docs/ci-cd.md section 6 creates for keyless CD, shared by the profile defaults
 * `brand:init` writes and the setup `brand:provision` prints.
 */
export const DEPLOY_SA = "firebase-deployer";
export const POOL_ID = "github-actions";
export const PROVIDER_ID = "github-oidc";

export const deploySaEmail = (projectId: string) =>
  `${DEPLOY_SA}@${projectId}.iam.gserviceaccount.com`;

export const workloadIdentityProvider = (projectNumber: string) =>
  `projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}`;

/** A Firebase project's messagingSenderId is its project number. */
export const defaultDeploy = ({
  projectId,
  projectNumber,
}: {
  projectId: string;
  projectNumber: string;
}) => ({
  workloadIdentityProvider: workloadIdentityProvider(projectNumber),
  serviceAccount: deploySaEmail(projectId),
});
