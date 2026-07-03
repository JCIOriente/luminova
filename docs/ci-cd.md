# CI/CD — Luminova (JCI Oriente)

Single source of truth for how code reaches production. Covers both halves of the
pipeline — **CI** (validation on every PR/push) and **CD** (keyless, approval-gated
deploy to Firebase). This is the living reference; dated provisioning records live in
`docs/status/`.

- **CI workflow:** `.github/workflows/ci.yml`
- **CD workflow:** `.github/workflows/deploy.yml`
- **Shared deploy setup:** `.github/actions/firebase-setup/action.yml`
- **Firebase project:** `jci-oriente` (Blaze) · **GitHub repo:** `JCIOriente/luminova` (public)

---

## 1. Overview

```
                        ┌──────────────────────────── CI ────────────────────────────┐
  PR / push to main ──▶ │  checks (build·lint·typecheck·test·bundle-budget·audit)      │
                        │  emulator (Firestore/Storage rules + beacon race guards)     │
                        └──────────────────────────────┬──────────────────────────────┘
                                                        │ CI concludes success on a push to main
                                                        ▼
                        ┌──────────────────────────── CD ────────────────────────────┐
                        │  filter  ── which surfaces changed? (rules/functions/hosting)│
                        │     │                                                         │
                        │     ├─ require reviewer approval (production environment) ────┤
                        │     ▼            ▼                     ▼                       │
                        │  deploy-rules ─▶ deploy-functions ─▶ deploy-hosting           │
                        │  (firestore+     (beacon gen2)       (preview → smoke →        │
                        │   storage+                            promote to live)         │
                        │   indexes)                                                    │
                        │            └──────────────▶ notify (optional webhook) ◀───────┤
                        └─────────────────────────────────────────────────────────────┘
```

**Design pillars**

1. **Keyless.** Deploy auth is Workload Identity Federation (OIDC). No long-lived
   service-account key exists anywhere — not in GitHub secrets, not on disk. GitHub
   mints a short-lived token per run; GCP exchanges it for a ~1h credential and only
   for this repo on `main`.
2. **Human-gated.** Every deploy job pauses on the GitHub `production` environment for
   a one-click reviewer approval. No unattended production change.
3. **Least blast radius.** Only the surface that actually changed deploys, in a safe
   order (data contract → backend → UI). Hosting never serves an unverified build.
4. **Nothing standing.** A leaked environment variable is inert — it only *names* the
   provider and SA; without a GitHub-minted token satisfying the attribute-condition it
   grants nothing.

---

## 2. CI (`ci.yml`)

Runs on every `pull_request` **targeting `main`** and every `push` to `main`. Two
required status checks:

| Job | Does | Path filter |
|-----|------|-------------|
| `checks` | `corepack` → `pnpm install --frozen-lockfile` → `format` → `turbo lint typecheck build` → **bundle-budget gate** (`tools/scripts/check-bundle-budget.sh`, gz `index-*` vs `docs/performance.md`) → unit `test` (apps+packages) → `knip` → `audit --audit-level=high` (non-blocking) → `test:seed` | Skips the heavy suite when the diff is docs/inert only, but **still runs and reports success** so it stays a valid required check (a paths-skipped required check would deadlock the PR). |
| `emulator` | JVM Firestore emulator: beacon recompute race + write-skip guards, then Firestore/Storage rules suites (serialized via `with-emulator-lock.sh` on port 4010) | Runs only when engine/rules paths change (`apps/beacon/`, `tests/`, `tools/scripts/`, `ci.yml`, `firestore.*`, `storage.rules`, `firebase.json`); otherwise skips-but-succeeds. |

Hardening: SHA-pinned actions, `timeout-minutes` backstops, `audit` is
`continue-on-error` (a freshly-published transitive CVE must not turn every unrelated
PR red — triage happens out-of-band via `secure-dep-vetting`), PR-scoped
`cancel-in-progress` that never cancels a post-merge `main` run.

The `main` branch ruleset requires **both** checks and is `enforcement: active`
(a ruleset can silently sit at `disabled` and gate nothing — verify `active`, not just
that checks are listed).

---

## 3. CD (`deploy.yml`)

### 3.1 Trigger & guard

```yaml
on:
  workflow_run: { workflows: ["CI"], types: [completed] }   # reads deploy.yml from the DEFAULT branch
  workflow_dispatch: { inputs: { surface: all|rules|functions|hosting } }
```

- **`workflow_run`** fires after the `CI` workflow completes. The `filter` job then
  gates on `conclusion == 'success' && head_branch == 'main' && event == 'push'`.
  Because `workflow_run` always executes the copy of `deploy.yml` on the **default
  branch**, a feature or fork PR can never modify deploy logic to touch the token.
- **`workflow_dispatch`** is the manual escape hatch (first-run validation, targeted
  re-deploy, rollback). **Must be dispatched from `main`** — the deploy jobs check out
  the dispatched ref and the WIF token is only honored for `refs/heads/main`.

```yaml
permissions: { contents: read }   # workflow default: least privilege
# id-token: write is granted per-job to the THREE deploy jobs only, so the ungated
# filter/notify jobs can never mint the deploy credential. filter also gets actions:read.
concurrency: { group: deploy-production, cancel-in-progress: false }  # never interrupt an in-flight deploy
```

### 3.2 Jobs

| Job | Runs when | Environment | Notes |
|-----|-----------|-------------|-------|
| `filter` | green-CI-on-main **or** manual dispatch | — | Checks out the deployed SHA (`fetch-depth: 0`) and diffs it against the **last successfully-deployed commit** (`gh run list --workflow Deploy --status success`, needs `actions: read`); falls back to the first parent, then to deploy-all. Emits `spotlight/backstage/functions/rules` booleans + the SHA. Untrusted-ish inputs (`surface`, SHAs) flow through `env:`, never inline `${{ }}` in `run:`. |
| `deploy-rules` | `rules == true` | `production` | Two steps: `firebase deploy --only firestore:rules,storage --force`, then `--only firestore:indexes` **without `--force`** (see §9 — index deletes fail loud instead of silently reaping). Both `--message <sha>`. |
| `deploy-functions` | `functions == true` and rules didn't fail | `production` | `firebase deploy --only functions --force --message <sha>` (predeploy builds beacon), then `functions:list` as a sanity check. gen2 = Cloud Run; no auto-rollback. |
| `deploy-hosting` | `spotlight` or `backstage` true, and **neither rules nor functions failed** | `production` | Build changed target(s) with `VITE_FIREBASE_EMULATOR_ENABLED=false`, then **preview → smoke → promote** (below). `needs` both prior deploy jobs so a failed rules deploy can't ship a UI against a data contract that never landed. |
| `notify` | always | — | No-op unless `DEPLOY_WEBHOOK_URL` repo secret is set. Posts a Slack/Discord-compatible message with per-surface results + run URL. |

**Surface → path mapping** (conservative; `packages/**` and the root dep/build files
feed every bundle, `firebase.json` touches everything):

| Surface | Deploys when the diff touches |
|---------|-------------------------------|
| `spotlight` (`hosting:jcioriente` ← `apps/spotlight/dist`) | `apps/spotlight/`, `packages/`, root deps†, `firebase.json` |
| `backstage` (`hosting:jcioriente-backstage` ← `apps/backstage/dist`) | `apps/backstage/`, `packages/`, root deps†, `firebase.json` |
| `functions` (`beacon`, nodejs24) | `apps/beacon/`, `packages/`, root deps†, `firebase.json` |
| `rules` | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` |

† **root deps** = `pnpm-lock.yaml`, `pnpm-workspace.yaml`, root `package.json`,
`turbo.json`. Included so an override-only security patch (the repo's CVE-fix pattern —
undici/form-data) actually redeploys the bundles that embed the vulnerable dep, instead
of merging green while prod keeps serving the old build. Rules don't embed node_modules,
so they're deliberately excluded from the root-dep trigger.

**Ordering rationale — rules → functions → hosting:** the data contract goes live
before the backend that relies on it (no fail-open window), the backend goes live
before the UI that calls it, and the user-visible hosting flip happens last and only
after a smoke test. `always() && needs.<prev>.result != 'failure' && != 'cancelled'`
lets a *skipped* upstream (unchanged surface) through while still stopping on a real
failure.

**Nothing deploys on red CI:** the `filter` guard is false → all surface flags resolve
empty → every deploy job's `if` is false → all skip.

### 3.3 Hosting: preview → smoke → promote (why there is no rollback step)

firebase-tools has **no** `hosting:rollback` command. Instead each changed target:

1. deploys to a short-lived preview channel `ci-<sha7>` (`--expires 1d --json`),
2. is smoke-tested: `curl -fsS --retry 5` on the channel root **and** on the hashed
   entry bundle (`/assets/*.js`) parsed out of the shell HTML — a plain 200 on the SPA
   shell would otherwise mask a build whose JS failed to upload,
3. is promoted to `live` with `firebase hosting:clone <site>:<chan> <site>:live` **only
   if the smoke passes.**

Every smoke failure path is an explicit `return 1`: the `promote()` function is invoked
as `promote … || rc=1`, which disables bash `errexit` inside it, so a failed `curl`
must not be allowed to fall through to the promote (this was a real defect — a failed
smoke used to promote the broken build and report success).

`live` therefore never serves a build that failed to load. **Per-target semantics:** the
two hosting targets promote independently — if one target's smoke fails, the other
still promotes and the job exits non-zero; re-running redeploys both. The preview
channel auto-expires.

---

## 4. Trust & security model

**No stored secret is required to deploy.** The only optional secret is a low-value
notification webhook.

| Attack | Blocked by |
|--------|-----------|
| Another GitHub repo tries to impersonate the deployer | STS **attribute-condition** pins `assertion.repository == 'JCIOriente/luminova'` |
| A feature/fork branch tries to deploy | attribute-condition pins `assertion.ref == 'refs/heads/main'`; `production` environment is main-only; `filter` guard rejects `event != push` / `head_branch != main` |
| A PR edits `deploy.yml` to exfiltrate the token | `workflow_run` executes `deploy.yml` from the **default branch** only |
| Unattended prod change | `production` environment **required reviewer** blocks every deploy job until approved |
| Leaked env var (`WIF_PROVIDER`, SA email) | Inert without a GitHub-minted OIDC token satisfying the attribute-condition |
| Script injection via dispatch input | Inputs/SHAs pass through `env:`, never inline in shell |

Fork PRs are **triple-gated** (filter guard + STS condition + main-only environment)
and run CI only — they can never deploy.

---

## 5. Infrastructure inventory (as provisioned)

Provisioned **2026-07-01** on project `jci-oriente` (number **953870918238**) by the
project owner via `gcloud`. All identifiers below are non-secret.

| Resource | Value |
|----------|-------|
| Deploy service account | `firebase-deployer@jci-oriente.iam.gserviceaccount.com` |
| WIF pool | `projects/953870918238/locations/global/workloadIdentityPools/github-actions` |
| WIF provider | `.../workloadIdentityPools/github-actions/providers/github-oidc` |
| Issuer | `https://token.actions.githubusercontent.com` |
| Attribute mapping | `google.subject=assertion.sub, attribute.repository=assertion.repository, attribute.ref=assertion.ref` |
| Attribute condition | `assertion.repository == 'JCIOriente/luminova' && assertion.ref == 'refs/heads/main'` |
| Pool → SA binding | `roles/iam.workloadIdentityUser` for `principalSet://.../attribute.repository/JCIOriente/luminova` |
| Runtime SA (gen2 actAs) | `953870918238-compute@developer.gserviceaccount.com` ← `roles/iam.serviceAccountUser` |

**Deploy SA project roles (least-privilege):**
`firebasehosting.admin`, `firebaserules.admin`, `datastore.indexAdmin`,
`cloudfunctions.admin`, `run.admin`, `artifactregistry.admin`,
`cloudbuild.builds.editor`, `eventarc.admin`, `serviceusage.serviceUsageConsumer`,
`firebasestorage.viewer` (added 2026-07-03).

> **Storage-rules deploy gotcha.** With the object form `"storage": {"rules": ...}`
> the CLI resolves the default bucket via the **v1alpha**
> `firebasestorage.../defaultBucket` endpoint, which 404s for this SA even with
> `firebasestorage.viewer` granted (alpha endpoint appears to require broader
> Firebase-level read, e.g. `firebase.projects.get`; Google masks the 403 as 404).
> `firebase.json` therefore pins the bucket explicitly via a `storage` **target**
> (`target: "default"` → `.firebaserc` → `jci-oriente.firebasestorage.app`), which
> skips that endpoint entirely — the release then goes through `firebaserules.admin`
> only. Do not revert `storage` to the object form.

**GitHub `production` environment:** required reviewer `arkgast`; deployments restricted
to `main`; variables `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`.
Optional repo secret `DEPLOY_WEBHOOK_URL` (unset → `notify` is a no-op).

**Enabled APIs:** `iamcredentials`, `sts`, `firebasehosting`, `firebaserules`,
`cloudfunctions`, `run`, `eventarc`, `artifactregistry`, `cloudbuild`, `firestore`,
`storage`, `serviceusage`.

---

## 6. One-time provisioning (reproducible)

The exact steps executed. Idempotent to re-run. Requires an operator with project
IAM admin + repo admin. `gh` covers the GitHub side; no console clicks required.

```bash
# --- shell context ---
export PROJECT_ID=jci-oriente
export PROJECT_NUMBER=953870918238
export GH_REPO=JCIOriente/luminova
export POOL_ID=github-actions
export PROVIDER_ID=github-oidc
export DEPLOY_SA=firebase-deployer
export DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# --- 1. enable APIs ---
gcloud config set project "$PROJECT_ID"
gcloud services enable \
  iamcredentials.googleapis.com sts.googleapis.com \
  firebasehosting.googleapis.com firebaserules.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com eventarc.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com \
  firestore.googleapis.com storage.googleapis.com serviceusage.googleapis.com

# --- 2. deploy service account ---
gcloud iam service-accounts create "$DEPLOY_SA" \
  --display-name="GitHub Actions Firebase deployer (WIF, keyless)"

# --- 3. WIF pool + provider (pinned to repo AND main) ---
gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" --display-name="GitHub Actions pool"
export POOL_NAME=$(gcloud iam workload-identity-pools describe "$POOL_ID" \
  --location="global" --format='value(name)')
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GH_REPO}' && assertion.ref == 'refs/heads/main'"

# --- 4. bind pool -> SA ---
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${GH_REPO}"

# --- 5. least-privilege IAM ---
for ROLE in \
  roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin \
  roles/cloudfunctions.admin roles/run.admin roles/artifactregistry.admin \
  roles/cloudbuild.builds.editor roles/eventarc.admin roles/serviceusage.serviceUsageConsumer \
  roles/firebasestorage.viewer ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="$ROLE" --condition=None --quiet
done
export RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="roles/iam.serviceAccountUser" --quiet

# --- 6. GitHub production environment (via gh; owner id from `gh api user`) ---
gh api -X PUT "repos/${GH_REPO}/environments/production" --input - <<JSON
{ "wait_timer": 0,
  "reviewers": [{"type": "User", "id": 5279327}],
  "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true} }
JSON
gh api -X POST "repos/${GH_REPO}/environments/production/deployment-branch-policies" \
  --input - <<< '{"name":"main","type":"branch"}'
for kv in \
  "WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}" \
  "WIF_SERVICE_ACCOUNT=${DEPLOY_SA_EMAIL}" \
  "GCP_PROJECT_ID=${PROJECT_ID}" ; do
  gh api -X POST "repos/${GH_REPO}/environments/production/variables" \
    -f "name=${kv%%=*}" -f "value=${kv#*=}"
done
```

> **First gen2 deploy bootstrap:** on a project that never deployed gen2 functions, the
> GCF/Eventarc/Cloud Build service agents may not exist yet — run one manual
> `firebase deploy --only functions` with human creds first. `jci-oriente` already runs
> gen2 (the `953870918238-compute` runtime SA exists), so this was **not** needed here.
>
> **Escape hatch:** if a deploy fails on a missing permission, grant
> `roles/firebase.admin` to the deploy SA temporarily, then narrow back to the list above.

---

## 7. Operating the pipeline

**Automatic (the normal path).** Merge to `main` → CI runs → on green, Deploy fires →
`filter` detects changed surfaces → each relevant deploy job waits on the `production`
approval → click **Review deployments → Approve** in the run → the changed surface
deploys. Unchanged surfaces skip.

**Manual (`workflow_dispatch`).** Actions → **Deploy** → **Run workflow**, branch =
`main`, pick a `surface` (`all | rules | functions | hosting`). Same approval gate.
Use for first-run validation, targeted re-deploy, or rollback re-deploy.

---

## 8. Validation runbook (escalating blast radius)

Run once, after the workflow is on `main`, dispatching from `main`:

1. **`surface=hosting`** → approve → confirm https://jcioriente.web.app and
   https://jcioriente-backstage.web.app both serve. (First real WIF token mint +
   impersonation + deploy.)
2. **`surface=rules`** → approve → confirm rules + indexes published (Console →
   Firestore → Rules; a signed-out `members` read is denied).
3. **`surface=functions`** → approve → confirm `functions:list` shows `beacon`
   functions on nodejs24.
4. **End-to-end:** push a trivial `apps/spotlight` change to `main` → CI green → only
   `deploy-hosting` (spotlight) runs → approve → site updates; functions/rules jobs
   skip.
5. **Negative test:** a dispatch from a non-`main` branch fails at auth (STS `ref`
   condition) and at the environment branch restriction.

---

## 9. Rollback

The smoke-then-promote flow keeps broken builds off `live`, so routine rollbacks are
rare. When still needed:

- **Hosting:** no `firebase hosting:rollback` CLI. Use Console → Hosting → target →
  release history → Rollback (atomic), or re-promote a prior version:
  `firebase hosting:clone <site>:live@<VERSION_ID> <site>:live`.
- **Functions (gen2):** no built-in rollback — `git revert` on `main` → CI green →
  auto re-deploy, or `workflow_dispatch surface=functions` from a good state. Emergency:
  shift Cloud Run traffic to a previous revision in the console.
- **Rules/indexes:** revert the commit + redeploy (ruleset history in console).
  `firestore.indexes.json` is the **single source of truth** for composite indexes: the
  index deploy step runs *without* `--force`, so any index that exists in prod but not
  in the file makes the deploy **fail loud** rather than silently delete it. If you ever
  create an index in the console, mirror it into `firestore.indexes.json` before the next
  rules-surface deploy. (Index *creation* is additive and always safe.)

---

## 10. Cost

Effectively **$0**.

- **GitHub Actions:** free — `JCIOriente/luminova` is a public repo (unlimited minutes).
- **WIF / STS / service account:** always free on GCP.
- **Hosting preview channels:** negligible; each `ci-<sha>` auto-expires in 1 day.
- **Only recurring cost:** gen2 function deploys push container images to Artifact
  Registry + a Cloud Build (free tier 120 build-min/day; a beacon build is ~1–2 min).
  Images accumulate — predates CD (manual `firebase deploy` does the same). Optional
  one-time caps: an **Artifact Registry cleanup policy** (keep last N) on the
  `gcf-artifacts` repo, and a **GCP budget alert** on `jci-oriente` (a runaway trigger
  loop on gen2 = Cloud Run is the only real billing risk).

---

## 11. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Deploy job fails at `google-github-actions/auth` | Env var wrong, or STS condition mismatch. Verify `WIF_PROVIDER` matches the provider resource name exactly and the run is on `main`. |
| `PERMISSION_DENIED` mid-deploy | Missing IAM role on the deploy SA — grant it (see role list), or temporarily grant `roles/firebase.admin` then narrow back. |
| `workflow_dispatch` deploy fails auth | Dispatched from a non-`main` branch — the STS `ref` condition only honors `refs/heads/main`. Re-dispatch from `main`. |
| Deploy never triggers after merge | The CI workflow's `name:` must equal `"CI"` (the `workflow_run.workflows` value). Also confirm CI concluded `success`. |
| `notify` never posts | `DEPLOY_WEBHOOK_URL` must be a **repository** secret, not a `production`-environment secret — the `notify` job has no `environment:` and can't read env-scoped secrets. |
| Hosting smoke fails, live untouched | Working as designed — the preview root or its entry bundle failed to load; live was never promoted. Inspect the preview URL in the job log. |
| One hosting target shipped, the other didn't | Per-target promotion — one target's smoke failed and it was left on the old build while the other promoted; the job is red. Fix the failing build and re-run (redeploys both). |
| Index deploy aborts on a delete prompt | An index exists in prod that isn't in `firestore.indexes.json` (see §9). Mirror it into the file, or intentionally remove it via the console first. |
| A merged change never deployed | Usually a superseded/failed prior run. The `filter` diffs since the **last successful Deploy**, so the *next* green push self-heals it; to force it now, `workflow_dispatch surface=all` from `main`. |

**Upgrading firebase-tools:** the version is pinned in **four** spots — `ci.yml` (cache
key + `npm install -g`) and `.github/actions/firebase-setup/action.yml` (cache key +
`npm install -g`). Bump all four together, plus the note at the end of this doc.

---

## 12. Deferred (deliberate, for solo-dev scale)

Not built yet; revisit when a second developer joins or infra grows:

- **Terraform / IaC** for the WIF + IAM + environment (currently provisioned imperatively
  and recorded in §6). Would make the trust boundary reviewable and reproducible.
- **Staging project** (a second Firebase project deployed from a `staging` branch).
- **Per-surface service accounts** (finer least-privilege than one deploy SA).
- **Build provenance / attestation** (SLSA) on the deployed artifacts.
- **PR preview channels** — the standard `action-hosting-deploy` needs a stored SA key
  (fork PRs could read it), conflicting with the keyless goal; revisit as a WIF-based,
  non-fork-only job.
- **`packageManager` integrity hash** — pin `pnpm@<v>+sha512.<hash>` (via
  `corepack use pnpm@<v>`) so corepack verifies the pnpm tarball. Low threat at solo
  scale; do it during the next pnpm bump rather than hand-writing the hash.

---

## Action pins

| Action | SHA | Version |
|--------|-----|---------|
| actions/checkout | `34e114876b0b11c390a56381ad16ebd13914f8d5` | v4.3.1 |
| actions/setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| actions/cache | `0057852bfaa89a56745cba8c7296529d2fc39830` | v4.3.0 |
| actions/setup-java | `c1e323688fd81a25caa38c78aa6df2d33d3e20d9` | v4.8.0 |
| google-github-actions/auth | `7c6bc770dae815cd3e89ee6cdf493a5fab2cc093` | v3.0.0 |

firebase-tools pinned `15.22.1` (matches CI).
