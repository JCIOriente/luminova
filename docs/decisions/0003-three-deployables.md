# 0003. Three separate deployables, not one composed app

**Status:** Accepted
**Date:** 2026-06-05
**Source:** `docs/specs/2026-06-05-firebase-tooling-setup-design.md`, "Locked decisions"
— *"App split | Option 1 — separate builds/deploys. No runtime composition. spotlight
ships zero Firebase by default."*

## Context

Two audiences with nothing in common. The public site serves anonymous visitors who
should never be able to reach member data. The admin dashboard serves an authenticated
board managing exactly that data. A composed application would have had both audiences
loading the same bundle and both sets of routes reachable from the same origin.

The spec considered runtime composition and rejected it explicitly, which is why this
is a recorded decision rather than an accident of layout.

## Decision

Three deployables against one Firebase project:

| Deployable | Hosting target | Firebase surface |
|---|---|---|
| `apps/spotlight` | `jcioriente` | `firebase/firestore/lite` only — no Auth, no realtime |
| `apps/backstage` | `jcioriente-backstage` | Full client SDK, Auth required |
| `apps/beacon` | — | Admin SDK only |

Two separate Firebase **web app registrations** in the same project, each with its own
App Check configuration. One Firestore database, one Storage bucket, shared by all
three.

The two sites are separate origins. A visitor to the public site cannot navigate to an
admin route, because it is not served there.

## Consequences

**Easy:** the public bundle carries no authentication code at all, which is both a
performance win ([0004](0004-lite-sdk-for-spotlight.md)) and a security property —
there is no admin surface to attack on the public origin. Each site deploys
independently, so a public-site copy change cannot break the admin dashboard.

**Hard:**

- **Anything genuinely shared has to become a package.** UI, types, auth and Firebase
  wiring all live in `packages/` because two apps need them. That is
  [0002](0002-monorepo-turborepo-pnpm.md)'s reason for existing.
- **Public data needs a deliberate path.** The public site can only read world-readable
  collections, which forces the projection pattern in
  [0008](0008-server-side-public-projections.md).
- **Branding and configuration live in more places than expected.** Favicons, PWA
  manifests, share images and service-worker titles exist per app. The "Adopting it for
  your chapter" section of the root README lists them precisely because missing one is
  publicly visible.

**Ruled out:** a single app with role-gated routes. Also ruled out: multi-tenancy — one
deployment serves one chapter, and the README says so.
