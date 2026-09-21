# 0006. CASL for ability modelling

**Status:** Accepted
**Date:** 2026-07-20
**Source:** `packages/auth/src/ability.ts` (including its inline rationale comments);
`docs/status/2026-07-20-authz-migration.md`;
`docs/status/2026-07-18-authz-audit.md` (the empty-instance probe and its verification);
`apps/backstage/src/lib/authz/probe.ts`. **The choice of CASL specifically is not
argued anywhere** — the migration handoff documents the move to capability-based gating,
not the library evaluation.

## Context

[0005](0005-perms-custom-claim.md) gives the client a flat list of `action:Subject`
strings. The UI needs to answer richer questions than that list does:

- Can this user update *this* member — which is true for their own record and false for
  everyone else's?
- Should this nav item render at all?

Answering those with string matching produces conditionals scattered across components,
which is where the UI and the rules drift apart.

## Decision

Build a CASL `MongoAbility` from the token's claims, in `@luminova/auth`.

Two independent streams feed it, and keeping them separate is the substance of the
decision:

1. **Coarse grants** come **solely** from the `perms` claim. An absent `perms` grants
   nothing.
2. **Object-scoped conditional grants** come from the built-in `roles` claim and are
   hard-coded in `applyConditional()` — e.g. `Member` gets `can(["read","update"],
   "Member", { uid })`. These are deliberately **not** editable in `/permisos`, because a
   UI cannot express a condition safely.

The UI consumes this through `<Can>` and `useCan`.

## Consequences

**Easy:** one place decides authority for the whole client; conditions like "own record"
are expressible; nav and route gating share the ability rather than reimplementing it.

**Hard:**

- **The ability is UX, never enforcement.** `firestore.rules` is the boundary. A direct
  SDK write never executes client code, so every invariant expressed here must also
  exist in the rules with a rules test. This is guardrail 2, and it has drifted
  repeatedly.
- **Subject-type questions can be answered by an instance-scoped grant.** Asking "can
  this user read Members?" returns true for a user who can only read *their own* member
  document — which once leaked admin nav to ordinary members. The fix was an
  empty-instance probe (`lib/authz/probe.ts`); the trap is inherent to asking a type
  question of an instance-scoped ability.
- **Conditional grants need a deploy.** They are code, by design.

**Ruled out:** expressing conditions as permission codes — the claim has no room
([0005](0005-perms-custom-claim.md)) and rules could not evaluate them cheaply.

## Note on Scanner

Scanner used to carry a CASL condition scoping check-in to specific events. Event
scoping was abandoned: Scanner now holds coarse `read:Activity` + `checkIn:Attendance`,
and the Attendee-only restriction is a Scanner-specific conjunct in `firestore.rules`,
mirrored in `features/check-in/lib/can-remove-entry.ts`. A worked example of a condition
that turned out to belong in the rules rather than the ability.
