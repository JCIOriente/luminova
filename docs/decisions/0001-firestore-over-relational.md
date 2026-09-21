# 0001. Firestore over a relational database

**Status:** Accepted
**Date:** 2026-06-05 (the date the tooling was stood up; the choice predates the record)
**Source:** **Rationale not recorded.** No spec or handoff argues the choice. What
follows is established from the implementation — `docs/architecture.md`,
`docs/data-models.md`, `docs/specs/2026-06-05-firebase-tooling-setup-design.md`.

## Context

Luminova is built and run by a volunteer chapter whose board rotates annually. There is
no operations team, no DBA, and no budget line for infrastructure. Whoever maintains it
next will be a volunteer too.

The record does not contain a comparison against Postgres or any other relational
option, so the reasoning below is inferred from what the codebase consistently assumes,
not from a documented deliberation.

## Decision

Firestore, inside a single Firebase project (`jci-oriente`) that also provides Auth,
Storage, Functions and Hosting.

What the implementation reveals as load-bearing:

- **Security rules as the enforcement boundary.** `firestore.rules` is the only thing
  standing between a browser and the data. There is no API tier to hide behind — the
  clients talk to the database directly. This is the single most consequential
  downstream effect, and every authorization decision since has had to live with it
  (see [0005](0005-perms-custom-claim.md), [0008](0008-server-side-public-projections.md)).
- **Document triggers as the compute model.** The recognition engine is a Firestore
  trigger, not a job or an endpoint. Writing a check-in *is* invoking the engine.
- **No server to operate.** Nothing to patch, scale, or wake up at 3am.

## Consequences

**Easy:** no infrastructure to run; real-time reads for free; one vendor for auth,
storage and compute; a public site that can read directly from the database without an
API layer.

**Hard:**

- **No joins and no schema.** Shape is enforced in three places that must be kept in
  agreement — Zod schemas in `@luminova/types`, the client repositories, and
  `firestore.rules`. Guardrail 2 in `docs/engineering-guardrails.md` exists because
  these drifted repeatedly.
- **Aggregates must be maintained, not queried.** `memberPoints/{memberId__termId}` is a
  derived document recomputed transactionally, because `SUM()` is not available. The
  transaction is not incidental — it is what keeps concurrent check-ins at a busy door
  from losing points.
- **Composite keys instead of foreign keys.** `activityId__memberId__role` is a primary
  key doing a join's job.
- **Every query must be bounded.** Guardrail 5 requires server-side `where`/`limit` and
  chunked `getAll` fan-out, because an unbounded collection scan is both a cost and a
  latency event.

**Ruled out:** SQL-shaped reporting. Anything resembling an ad-hoc analytical query has
to be either a maintained aggregate or an export.

## If you are reconsidering this

The cost of reversal is now high and concentrated in `firestore.rules` and
`apps/beacon`. Before proposing it, read
[0008](0008-server-side-public-projections.md) — the projection pattern is the main
thing a relational model would make unnecessary, and the main thing you would have to
replace.
