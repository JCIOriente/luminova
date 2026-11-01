#!/usr/bin/env bash
# Is this repository set up to deploy, and as whom? CD's target and sign-in come from the
# repository variables (Settings, Secrets and variables, Actions, Variables; none is a
# secret), passed in through `env:`:
#
#   FIREBASE_PROJECT_ID  required  the Firebase project id
#   GCP_PROJECT_NUMBER   required  its project number
#   GCP_REGION           optional  the deployed callables' region, default us-central1
#   WIF_PROVIDER         optional  overrides the Workload Identity provider derived below
#   DEPLOY_SA            optional  overrides the service account derived below
#
# A fork that has not set the two required ones, or names a `demo-` project (it exists only
# in the emulators), skips every deploy job with a notice instead of failing on every merge
# to main. A variable that is set but malformed fails loudly: a typo is not "not set up".
# Every value is checked against an anchored pattern before it is printed, so none can carry
# a line break into $GITHUB_OUTPUT or $GITHUB_ENV.
#
# The derived names are the ones `pnpm brand:provision` creates. Twin of
# packages/brand/src/deploy-identity.ts (bash cannot import it); deploy-ready.test.mjs pins
# them to it.
#
# Prints `project=<id>`, `ready=true|false`, then either `reason=<one line>` or the sign-in:
# `project_number`, `region`, `workload_identity_provider`, `service_account`.
# Usage: deploy-ready.sh
set -euo pipefail

deploy_sa=firebase-deployer
pool_id=github-actions
provider_id=github-oidc

project_re='^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
number_re='^[1-9][0-9]{0,19}$'
region_re='^[a-z]+(-[a-z]+)+[0-9]+$'
provider_re='^projects/[0-9]+/locations/global/workloadIdentityPools/[a-z0-9-]+/providers/[a-z0-9-]+$'
account_re='^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$'

project="${FIREBASE_PROJECT_ID:-}"
number="${GCP_PROJECT_NUMBER:-}"
region="${GCP_REGION:-}"
provider="${WIF_PROVIDER:-}"
account="${DEPLOY_SA:-}"

invalid=0
# Usage: expect <variable name> <value> <pattern> <what it must be>
expect() {
  if [ -n "$2" ] && ! [[ "$2" =~ $3 ]]; then
    echo "deploy-ready: repository variable $1 must be $4. Fix it: gh variable set $1 --body <value>" >&2
    invalid=1
  fi
}
expect FIREBASE_PROJECT_ID "$project" "$project_re" "a Firebase project id (lowercase letters, digits and hyphens, 6 to 30 characters)"
expect GCP_PROJECT_NUMBER "$number" "$number_re" "the project number, digits only (gcloud projects describe <project id> --format='value(projectNumber)')"
expect GCP_REGION "$region" "$region_re" "a Cloud Run region such as us-central1, or unset"
expect WIF_PROVIDER "$provider" "$provider_re" "projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>, or unset"
expect DEPLOY_SA "$account" "$account_re" "a service account email (<name>@<project>.iam.gserviceaccount.com), or unset"
if [ "$invalid" != 0 ]; then exit 1; fi

echo "project=$project"
missing=()
if [ -z "$project" ]; then missing+=(FIREBASE_PROJECT_ID); fi
if [ -z "$number" ]; then missing+=(GCP_PROJECT_NUMBER); fi
if [ "${#missing[@]}" -gt 0 ]; then
  list=$(printf ', %s' "${missing[@]}")
  if [ "${#missing[@]}" -gt 1 ]; then noun="repository variables ${list:2} are"; else noun="repository variable ${list:2} is"; fi
  commands=""
  for name in "${missing[@]}"; do
    case "$name" in
      FIREBASE_PROJECT_ID) commands+="; gh variable set FIREBASE_PROJECT_ID --body <project id>" ;;
      GCP_PROJECT_NUMBER) commands+="; gh variable set GCP_PROJECT_NUMBER --body <project number>" ;;
    esac
  done
  echo "ready=false"
  echo "reason=$noun not set, so CD has nowhere to deploy. Once pnpm brand:provision is done, set them${commands} (docs/adopting.md)."
  exit 0
fi
if [[ "$project" == demo-* ]]; then
  echo "ready=false"
  echo "reason=FIREBASE_PROJECT_ID is $project, a local-only project that exists only in the emulators. To go live: create a Firebase project, connect it with pnpm brand:init, run pnpm brand:provision, then gh variable set FIREBASE_PROJECT_ID --body <project id> (docs/adopting.md)."
  exit 0
fi

echo "ready=true"
echo "project_number=$number"
echo "region=${region:-us-central1}"
echo "workload_identity_provider=${provider:-projects/$number/locations/global/workloadIdentityPools/$pool_id/providers/$provider_id}"
echo "service_account=${account:-$deploy_sa@$project.iam.gserviceaccount.com}"
