# CD pipeline — keyless deploy to Firebase

Status: workflow authored (`.github/workflows/deploy.yml`). **Blocked on one-time
owner provisioning (Part A) before it can deploy.** Until then the workflow runs but
the deploy jobs fail at the auth step (no WIF provider / env configured).

## How it works

```
push to main ─▶ CI (checks + emulator) ─▶ green? ─▶ Deploy workflow
                                                      │
                                          filter (which surfaces changed)
                                                      │
                              ┌───────── require reviewer approval ─────────┐
                              ▼                    ▼                        ▼
                        deploy-rules ──▶ deploy-functions ──▶ deploy-hosting
                     (firestore+storage)     (beacon gen2)    (changed targets)
```

- **Trigger:** `workflow_run` after the `CI` workflow concludes `success` on a push
  to `main`. Plus `workflow_dispatch` (manual) for first-run validation / rollback.
  `workflow_run` reads `deploy.yml` from the **default branch**, so no feature/PR
  branch can alter deploy logic or touch the token.
- **Auth:** Workload Identity Federation (OIDC). **No long-lived key anywhere.**
  GitHub mints a short-lived token per run; GCP STS only honors it for
  `JCIOriente/luminova` on `refs/heads/main` (provider attribute-condition).
- **Approval:** every deploy job uses the `production` GitHub environment → pauses for
  a one-click reviewer approval; environment is branch-restricted to `main`.
- **Path-filtered:** only the changed surface deploys (`spotlight` / `backstage` /
  `functions` / `rules`). `packages/**` rebuilds all app+functions surfaces;
  `firebase.json` touches all.
- **Order:** rules+indexes → functions → hosting (data contract before backend before
  UI; hosting flips last and only after a smoke test passes).
- **Hosting = preview → smoke → promote (no rollback needed).** Each changed target
  deploys to a short-lived preview channel (`ci-<sha>`, 1-day expiry); the workflow
  HTTP-smoke-tests the channel URL and only `hosting:clone`s it to `live` if the smoke
  passes. Live never serves a broken build, so there is no rollback step to get wrong.
  (firebase-tools has **no** `hosting:rollback` command — this pattern replaces it.)
- **Functions** have no built-in rollback (gen2 = Cloud Run); revert-and-redeploy is
  the documented path. The job runs `functions:list` as a post-deploy sanity check.
- **Traceability:** rules/functions deploys carry `--message <sha>`; the hosting job
  sets the GitHub deployment `url`. Outcomes post to an optional webhook (`notify`).
- **DRY:** the per-job setup (Node + pnpm + firebase-tools + WIF auth) lives in one
  composite action, `.github/actions/firebase-setup`.
- Nothing deploys on a red CI run: the `filter` job's `if` is false, so all surface
  flags resolve empty and every deploy job skips.

## Part A — one-time owner runbook (gcloud + GitHub)

Requires GCP project IAM admin + GitHub repo admin. Run once.

```bash
PROJECT_ID=jci-oriente
PROJECT_NUMBER=$(gcloud projects describe jci-oriente --format='value(projectNumber)')
GH_REPO=JCIOriente/luminova
POOL_ID=github-actions
PROVIDER_ID=github-oidc
DEPLOY_SA=firebase-deployer
```

### A.1 Enable APIs
```bash
gcloud config set project "$PROJECT_ID"
gcloud services enable \
  iamcredentials.googleapis.com sts.googleapis.com \
  firebasehosting.googleapis.com firebaserules.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com eventarc.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com \
  firestore.googleapis.com storage.googleapis.com serviceusage.googleapis.com
```

### A.2 Deploy service account
```bash
gcloud iam service-accounts create "$DEPLOY_SA" \
  --display-name="GitHub Actions Firebase deployer (WIF, keyless)"
DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
```

### A.3 WIF pool + provider — pinned to this repo AND main
```bash
gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" --display-name="GitHub Actions pool"

POOL_NAME=$(gcloud iam workload-identity-pools describe "$POOL_ID" \
  --location="global" --format='value(name)')

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GH_REPO}' && assertion.ref == 'refs/heads/main'"
```
The attribute-condition is the core control: GitHub's OIDC issuer signs tokens for
every repo on github.com, so without it any repo could impersonate the deployer. It
makes GCP's STS reject any token not from this exact repo on `main`.

### A.4 Bind pool → deploy SA
```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${GH_REPO}"
```

### A.5 Least-privilege IAM
```bash
for ROLE in \
  roles/firebasehosting.admin \
  roles/firebaserules.admin \
  roles/datastore.indexAdmin \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/artifactregistry.admin \
  roles/cloudbuild.builds.editor \
  roles/eventarc.admin \
  roles/serviceusage.serviceUsageConsumer ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="$ROLE"
done

# gen2 functions = Cloud Run; deployer must actAs the runtime SA. Grant on the SA, not project-wide.
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"  # confirm: gcloud iam service-accounts list
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```
- **First gen2 deploy bootstrap:** if this project has never deployed gen2 functions,
  the GCF/Eventarc/Cloud Build service agents may not exist. Run one manual
  `firebase deploy --only functions` with human creds first, then hand off to the SA.
- **Escape hatch:** if a deploy fails on a missing permission, grant
  `roles/firebase.admin` temporarily, then narrow back to the list above.

### A.6 GitHub `production` environment
Settings → Environments → New environment → `production`:
- **Required reviewers:** add the owner (forces the approval click).
- **Deployment branches:** restrict to `main`.
- Add **environment variables** (these are non-sensitive identifiers, NOT secrets):
  - `WIF_PROVIDER` = `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}`
  - `WIF_SERVICE_ACCOUNT` = `${DEPLOY_SA_EMAIL}`
  - `GCP_PROJECT_ID` = `jci-oriente`

There are **zero stored secrets** — auth is OIDC-minted per run; a leaked env var is
useless without a token satisfying the attribute-condition.

**Optional:** to receive deploy-outcome pings, add a **repository** secret (Settings →
Secrets and variables → Actions, *not* the `production` environment) named
`DEPLOY_WEBHOOK_URL` — a Slack- or Discord-compatible incoming webhook. The `notify`
job runs without an environment so it can post on every outcome without an approval
prompt, which means it only sees repo-level secrets; an environment-scoped secret
would be invisible to it. If unset, `notify` is a no-op. This webhook URL is the only
stored secret, and a low-value one (it can only post a message to your channel).

## Verification (escalating blast radius)

1. **WIF dry-run:** `workflow_dispatch` (any surface) → confirm the `google-github-actions/auth`
   step succeeds (token mint + impersonation).
2. **First real deploy = hosting** (`workflow_dispatch surface=hosting`), approve,
   verify both sites; then `surface=rules`; then `surface=functions`.
3. **End-to-end:** trivial spotlight change → merge → CI green → only `deploy-hosting`
   (spotlight) runs → approve → site updates; confirm functions/rules jobs skipped.
4. **Negative test:** a non-main branch / fork cannot mint a token (STS rejects via
   `assertion.ref`; GitHub rejects via environment branch restriction).

## Rollback

The hosting smoke-then-promote flow means a broken build is rejected *before* it
reaches `live`, so routine rollbacks are rare. When you still need to revert:

- **Hosting:** there is **no** `firebase hosting:rollback` CLI command. Use the Firebase
  console (Hosting → release history → Rollback, one click, atomic), or re-promote a
  prior version with `firebase hosting:clone <site>:live@<VERSION_ID> <site>:live`.
- **Functions (gen2):** no built-in rollback — redeploy the previous good commit
  (`workflow_dispatch surface=functions` from the last good state, or `git revert` on
  main → CI green → auto redeploy). Emergency: roll Cloud Run traffic to a previous
  revision in the console.
- **Rules/indexes:** revert the commit + redeploy (ruleset history in console; indexes
  are additive).

## Cost & operational notes

**This pipeline is effectively free.**
- **GitHub Actions:** `$0` — `JCIOriente/luminova` is a **public** repo, so Actions
  minutes are unlimited/free.
- **WIF / service account / STS token exchange:** `$0` — always free on GCP.
- **Hosting preview channels:** negligible; each `ci-<sha>` channel auto-expires in 1
  day and the smoke test is a single request.
- **Only recurring cost:** gen2 function deploys push container images to Artifact
  Registry + a Cloud Build (free tier: 120 build-min/day, a beacon build is ~1–2 min).
  Images accumulate over time — this predates CD (manual `firebase deploy` does the
  same). Optional one-time caps: an **Artifact Registry cleanup policy** (keep last N)
  on the `gcf-artifacts` repo, and a **GCP budget alert** on `jci-oriente` (gen2 =
  Cloud Run; a runaway trigger loop is the only real billing risk).

**Operational caveats:**
- **`workflow_dispatch` must be run from the `main` branch.** Deploy jobs check out
  the dispatched ref, and the WIF token is only honored for `refs/heads/main` (STS
  attribute-condition) — dispatching from any other branch fails at auth *and* at the
  main-only environment restriction (fails safe, but the error is opaque).
- **Public-repo safety:** fork PRs run CI but cannot deploy — the `filter` guard
  rejects `event == 'pull_request'`, a fork's `assertion.repository` claim (`fork/…`)
  fails the STS condition, and the `production` environment is main-only. Triple-gated.

## Deferred

- **PR preview channels** — the standard `FirebaseExtended/action-hosting-deploy`
  needs a stored SA JSON key (fork PRs could read it), conflicting with the keyless
  goal. Revisit later as a WIF-based, non-fork-only job.
- **`tag-release` job** + `deploy:*:ci` npm scripts — ergonomic, not required.

## Action pins (deploy.yml)

| Action | SHA | Version |
|--------|-----|---------|
| actions/checkout | `34e114876b0b11c390a56381ad16ebd13914f8d5` | v4.3.1 |
| actions/setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| actions/cache | `0057852bfaa89a56745cba8c7296529d2fc39830` | v4.3.0 |
| google-github-actions/auth | `7c6bc770dae815cd3e89ee6cdf493a5fab2cc093` | v3.0.0 |

firebase-tools pinned `15.22.1` (matches CI).
