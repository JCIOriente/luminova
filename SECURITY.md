# Security Policy

## Reporting a vulnerability

Report privately. Do not open a public issue.

Use [GitHub's private vulnerability reporting](https://github.com/JCIOriente/luminova/security/advisories/new)
on this repository. If that is unavailable to you, email **jci.orienteolm@gmail.com**
with `SECURITY` in the subject.

Please include what you can:

- The affected surface — `spotlight`, `backstage`, `beacon`, `firestore.rules`, or a package.
- What an attacker can do, concretely.
- Steps to reproduce, ideally against the local emulator suite.

We are a volunteer chapter, not a company with an on-call rotation. Expect a first
response within a week. We will confirm the issue, agree on a disclosure timeline
with you, and credit you in the advisory unless you prefer otherwise.

## Supported versions

This project is deployed continuously from `main`. Only `main` is supported. There
are no maintained release branches.

## Things that look like vulnerabilities but are not

These come up on every public Firebase repository. Please read before reporting.

### The Firebase API keys in this repository are not secrets

`apps/*/.env.local.example` and `apps/*/.env.production` contain values such as
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID` and `VITE_FIREBASE_PROJECT_ID`.

These are **public client identifiers**, not credentials. Firebase requires them to
be shipped in the browser bundle, so they are visible to anyone who opens DevTools on
the live site. Google documents this explicitly. They authorise nothing on their own.

Access control lives in three places, all of them server-side:

- `firestore.rules` and `storage.rules` — every read and write is gated on
  authentication and on the caller's `perms` custom claim.
- Firebase App Check (reCAPTCHA v3) — attests that requests come from the real apps.
- Cloud Functions in `apps/beacon` — the only writer of points, claims and public
  projections, running on the Admin SDK.

`VITE_APPCHECK_SITE_KEY` is likewise a reCAPTCHA **site** key, which is public by
design. The corresponding secret key is held in the Firebase console.

**A rules bypass is a real vulnerability and we want to hear about it.** The presence
of the web API key is not.

### Deployment holds no stored credentials

The deploy workflow authenticates through Workload Identity Federation (OIDC). There
is no service-account key in the repository, in CI, or anywhere else. See
[`docs/ci-cd.md`](docs/ci-cd.md).

### Seed data is fictional

`tools/scripts/seed-emulator.mjs` creates invented members and a well-known local
password (`admin@jci.cc` / `Secret1`) for the emulator only. The script refuses to run
against production, and `pnpm seed:production` prompts for a real password interactively.
No member data is committed to this repository.
