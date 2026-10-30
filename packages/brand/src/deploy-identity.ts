import type { Env } from "./load-profile.ts";

/**
 * The names docs/ci-cd.md section 6 creates for keyless CD. `brand:provision` prints the
 * setup with them, and CD derives its sign-in from them and the repository variables
 * FIREBASE_PROJECT_ID and GCP_PROJECT_NUMBER. Twin: .github/scripts/deploy-ready.sh, which
 * its test pins to these values.
 */
export const DEPLOY_SA = "firebase-deployer";
export const POOL_ID = "github-actions";
export const PROVIDER_ID = "github-oidc";

/** The repository variables CD reads (docs/ci-cd.md); none is a secret. */
export const PROJECT_VARIABLE = "FIREBASE_PROJECT_ID";
export const PROJECT_NUMBER_VARIABLE = "GCP_PROJECT_NUMBER";

/** A Google Cloud project number. Twin: .github/scripts/deploy-ready.sh. */
export const PROJECT_NUMBER_PATTERN = /^[1-9][0-9]{0,19}$/;

/**
 * Set only by CD's firebase-setup, to the project deploy-ready.sh validated. brand:pull and
 * brand:ci-config switch to CD mode on it alone: a member's shell may well export
 * FIREBASE_PROJECT_ID for other tools, and that must not turn their pull into CD's.
 */
export const CD_PROJECT_ENV = "BRAND_CD_PROJECT";

/** The project CD deploys, or null outside CD. */
export function cdProject(env: Env): string | null {
  return env[CD_PROJECT_ENV]?.trim() || null;
}

export const deploySaEmail = (projectId: string) =>
  `${DEPLOY_SA}@${projectId}.iam.gserviceaccount.com`;

const workloadIdentityProvider = (projectNumber: string) =>
  `projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}`;

/** CD's sign-in when WIF_PROVIDER and DEPLOY_SA do not override it. */
export const deployIdentity = ({
  projectId,
  projectNumber,
}: {
  projectId: string;
  projectNumber: string;
}) => ({
  workloadIdentityProvider: workloadIdentityProvider(projectNumber),
  serviceAccount: deploySaEmail(projectId),
});

/**
 * The provider's attribute condition: only the fork's own repository, on its main branch,
 * running its own deploy.yml, gets a token (docs/ci-cd.md section 6 writes the same).
 * `assertion.*` reads the GitHub OIDC token's claims directly, so `workflow_ref` needs no
 * attribute mapping.
 */
export const attributeCondition = (repository: string) =>
  `assertion.repository == '${repository}' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '${repository}/.github/workflows/deploy.yml@refs/heads/main'`;
