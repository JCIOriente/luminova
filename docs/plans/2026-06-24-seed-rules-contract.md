# Seed↔Rules contract test + mirror drift guard

**Status:** implemented (branch `chore/seed-rules-contract`).
**Prompted by:** PR #107 — the seed scripts minted only the `roles` claim while the
perm-gated `firestore.rules` read a separate `perms` claim, so the seeded Admin failed
closed on every read ("No se pudieron cargar …"). No test caught it: the rules suite only
proved *canonical-perms ⊨ rules*, and the seed unit test asserted the (wrong) claim shape.

## Problem

The contract "the claims a seeded user actually receives satisfy the rules" was never
tested end to end. Separately, the plain-Node seed scripts hand-mirror the canonical
`@luminova/types` role→perms table in `tools/scripts/lib/role-seed.mjs` (they run in raw
Node and can't import workspace packages), and that mirror had only a weak hardcoded-value
snapshot guard.

## Changes

1. **Contract via the existing suite (Change A).** `tests/firestore-rules/rules.test.ts`
   now builds claims with the real seed producer (`permsForRoles` imported from
   `tools/scripts/lib/role-seed.mjs`) instead of a private re-implementation — so the whole
   suite is now a "seed-output ⊨ rules" contract, and a 4th copy of the resolution logic is
   deleted.
2. **President regression test (Change B).** `presidentClaims()` + `PRESIDENT_ROLES` moved
   to an import-free `tools/scripts/lib/president-claims.mjs` (so the client-SDK rules test
   can import it without pulling in firebase-admin). New
   `tests/firestore-rules/seed-contract.test.ts` feeds the real producer into
   `authenticatedContext` and asserts the members/allies reads that broke now succeed —
   plus representative `seed:roles` grants (Membership→allies, Treasury→members). Proven
   RED against a `presidentClaims()` reverted to drop `perms`.
3. **Real drift guard (Change C).** `packages/types/src/role-definition.mirror.test.ts`
   deep-equals the `.mjs` mirror against the canonical `BUILT_IN_ROLE_PERMS` / `ROLE_LABELS`
   and checks `permsForRoles` per role. Runs in the fast `checks` CI job; the canonical
   package owns the proof its mirror matches. The weak snapshot in `role-seed.test.mjs` is
   retired (behavioral tests stay).
4. **Self-diagnosing errors + runbook (Change D).** `apps/backstage/src/lib/firestore-errors.ts`
   `isPermissionDenied()` + a `QueryCache({ onError })` chokepoint in `query-client.ts` that
   logs a dev-only hint on permission-denied; a deploy-runbook note in `firebase-setup.md`
   that claim/rule changes need a token refresh.

## Why two guards (not one)

The original bug was a *producer omitting the `perms` key* — a table-drift check would
never see it. A future rule that starts requiring a perm the seed doesn't mint would slip
past the drift guard too. The contract test (#1/#2) and the drift guard (#3) are
orthogonal; together with `seed==canonical` they guarantee `seed-claims ⊨ rules`.

## Follow-up

Eliminating the mirror entirely → `docs/plans/2026-06-24-eliminate-seed-mirror.md`.
