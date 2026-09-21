# 0009. Keyless deploys via Workload Identity Federation

**Status:** Accepted
**Date:** 2026-06-25
**Source:** `docs/ci-cd.md` sections 1 ("Design pillars"), 4 ("Trust & security model")
and 6 ("One-time provisioning"); `.github/workflows/deploy.yml`.

## Context

`JCIOriente/luminova` is a **public** repository maintained by volunteers. The
conventional way to deploy Firebase from CI is to store a service-account JSON key in a
GitHub secret. That key is long-lived, works from anywhere, and is only as safe as the
repository's access controls and every maintainer's account — across an annual board
handover.

A volunteer organization is exactly the setting where a leaked key is most likely and
least likely to be noticed.

## Decision

Workload Identity Federation with OIDC. **No service-account key exists anywhere** —
not in GitHub secrets, not on disk.

The four design pillars, as `ci-cd.md` states them:

1. **Keyless.** GitHub mints a short-lived token per run; GCP exchanges it for a ~1h
   credential, and only for this repository on `main`. The WIF provider is pinned to
   both repo and branch by attribute condition.
2. **Human-gated.** Every deploy job pauses on the GitHub `production` environment for a
   one-click reviewer approval. No unattended production change.
3. **Least blast radius.** Only the surface that actually changed deploys, in a safe
   order: data contract → backend → UI (rules, then functions, then hosting).
4. **Nothing standing.** A leaked environment variable is inert. It only *names* the
   provider and service account; without a GitHub-minted token satisfying the attribute
   condition, it grants nothing.

`id-token: write` is granted **per job** to the three deploy jobs only, so the ungated
filter and notify jobs cannot mint the deploy credential.

Hosting goes **preview → smoke → promote**. This is why there is no rollback step: a
build that fails its smoke test is never promoted, so live never served it.

## Consequences

**Easy:** nothing to rotate; a repository compromise does not hand over production; the
whole trust model is readable in `deploy.yml` and the IAM inventory in `ci-cd.md`
section 5.

**Hard:**

- **Provisioning is genuinely intricate.** Pool, provider, attribute condition, service
  account binding, and several non-obvious IAM grants — including the `appspot` service
  account needed to satisfy the firebase-tools functions-deploy preflight, and a
  **billing-account-level** (not project-level) read for the same preflight. Section 6
  exists as a reproducible script because this is not re-derivable.
- **Deploys need a human.** By design, and it means nobody deploys while asleep.
- **Org policy can silently break it.** A gen2 callable once lost its `allUsers`
  `run.invoker` binding on deploy, producing 401s that surfaced as
  `FirebaseError: internal`. It can recur if org policy strips the binding again.
- **Firebase CLI is version-pinned** in CI, because an unpinned upgrade changes deploy
  behaviour.

**Ruled out:** a stored service-account key; unattended deploys; a rollback step for
hosting, which the preview-smoke-promote order makes unnecessary.

## Cost

Effectively zero. Actions minutes are free on a public repo, WIF/STS is free, preview
channels expire in a day. The only recurring cost is gen2 function container images
accumulating in Artifact Registry — which predates this pipeline and is equally true of
a manual `firebase deploy`.
