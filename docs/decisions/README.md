# Architecture decision records

The root [README](../../README.md) explains *what* Luminova is.
[CONTRIBUTING](../../CONTRIBUTING.md) explains *how* to work on it.
These explain **why** the shape is what it is.

Each record is one page: the forces at the time, what was chosen, and what that choice
made easy or hard. They are **not** updated as the system evolves — a decision that gets
reversed gets a new record that supersedes the old one, and the old one stays.

## The sourcing rule

> Every ADR cites the spec, status handoff, or code it was derived from. Where the
> record does not preserve the rationale, the ADR says **"rationale not recorded"** and
> states what can be established from the implementation — it never supplies a
> motivation that nobody wrote down.

This matters more than it sounds. A plausible-but-invented rationale is worse than an
absent one: it gets cited, and the next person reverses a decision for a reason that was
never real.

## The records

| # | Decision | Status |
|---|---|---|
| [0001](0001-firestore-over-relational.md) | Firestore over a relational database | Accepted |
| [0002](0002-monorepo-turborepo-pnpm.md) | A pnpm + Turborepo monorepo | Accepted |
| [0003](0003-three-deployables.md) | Three separate deployables, not one composed app | Accepted |
| [0004](0004-lite-sdk-for-spotlight.md) | `firebase/firestore/lite` for the public site | Accepted |
| [0005](0005-perms-custom-claim.md) | Coarse permissions in a `perms` custom claim | Accepted |
| [0006](0006-casl-for-abilities.md) | CASL for ability modelling | Accepted |
| [0007](0007-bespoke-ui-package.md) | A bespoke token-driven `@luminova/ui` | Accepted |
| [0008](0008-server-side-public-projections.md) | Server-written public projections | Accepted |
| [0009](0009-keyless-deploy-via-wif.md) | Keyless deploys via Workload Identity Federation | Accepted |
| [0010](0010-computed-review-routing.md) | Computed review routing and worktree-first | Accepted |

## Adding one

Copy the template below. Number sequentially. Add a row above.

Write a record when a choice would otherwise have to be reverse-engineered from the
code — a road not taken, a constraint that is not visible in the result, a trade-off
someone will be tempted to undo. Routine choices that follow from an earlier decision do
not need their own record.

```markdown
# NNNN. <Title>

**Status:** Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD
**Source:** <path to the spec, handoff or code — or "rationale not recorded">

## Context
<the forces at play — what made this a decision rather than a default>

## Decision
<what was chosen>

## Consequences
<what this makes easy, what it makes hard, what it rules out>
```
