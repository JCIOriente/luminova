# @luminova/auth — Claude Code Guide

## Purpose

The authorization vocabulary shared by both frontends and the functions backend:
who a member is (`roles`), what they may do (`perms`), and the CASL ability that
answers `can(action, subject)`. It owns **no data** — it reads claims minted
elsewhere and turns them into decisions.

This package is on the review router's **hard-gated auth surface**: a change here
needs `/security-review` plus the `firestore-security-reviewer` subagent before a
PR can open. That is not ceremony — every consumer below trusts what this returns.

## Entry points (no barrel — import the subpath)

| Import | Exports |
|---|---|
| `@luminova/auth/roles` | `AuthClaims`, `Role`, `ROLES`, `isValidRole`, `hasRole`, `hasAnyRole` |
| `@luminova/auth/ability` | `buildAbility`, `subject`, `AppAbility`, `Action`, `Subject` |
| `@luminova/auth/perms` | `resolveEffectivePerms` |

`exports` maps types to `src/*.ts` but runtime to `dist/*.js`, so a **fresh
worktree must build this package before an app's vitest run** — an unbuilt `dist`
surfaces as a module-resolution failure in the consumer, not here.

## The two-layer model

A member's authority comes from two independent claims, and conflating them is
the mistake to avoid:

1. **Coarse perms** (`claims.perms`, `"action:Subject"` codes) — data-driven,
   editable in the admin UI, resolved by `resolveEffectivePerms` as
   *union of role permissions + overrides.grant − overrides.revoke*. Revoke wins.
2. **Conditional grants** (`applyConditional` in `ability.ts`) — object-scoped
   rules that cannot be expressed as a coarse code, so they stay **hardcoded per
   built-in role** and are not UI-editable: `Scanner`'s `checkIn` scoped to
   `scannerEventIds`, `Member`'s self-scoped `read/update` on its own `uid`.

`buildAbility` applies perms first, then conditional grants, both derived from
`claims`. Adding a conditional grant is a code change plus a rules change — never
a data change.

## Invariants

- **`resolveEffectivePerms` returns the set UNCAPPED.** The caller enforces
  `PERMISSION_CAP` (`@luminova/types`): fail-closed in the beacon claims-sync
  trigger, and as a save-blocking preview in the backstage permissions UI. If you
  add a third caller, it must enforce the cap too.
- Output is **deduped and sorted** so idempotent claim writes compare equal. Do
  not "optimize" the sort away — it is what stops the trigger rewriting claims
  every run.
- **`claims.perms` is optional.** Pre-backfill tokens fall back to
  `BUILT_IN_ROLE_PERMS`. Removing that fallback is a deliberate, separately
  tracked migration — it breaks roles-only test fixtures across the repo.
- **A perm is not a rules grant.** `can(...)` gates the *UI*; `firestore.rules`
  gates the *data*. Every write invariant you add here must have a mirror in
  `firestore.rules` with a rules test, or a direct SDK write bypasses it.

## Gotchas that have bitten before

- **`read:Project` ≠ `read:Program`.** `Member` carries `Project`, never
  `Program`. Gating a detail *fetch* on `can("read", kind)` silently breaks
  Program-type directors. Fetch unconditionally (rules make reads signed-in) and
  gate the **writes**.
- **`BUILT_IN_ROLE_PERMS` is mirrored by the seed scripts.** `role-seed.mjs` and
  `seed-production.mjs` must stay in sync with `packages/types/src/role-definition.ts`;
  a mirror test in `packages/types` enforces it. Changing a built-in role's perms
  means changing both, or CI fails on the mirror.
- **Dropping a `Subject` is compiler-guided.** `SUBJECT_LABELS` is an exhaustive
  `Record`, so removing a subject surfaces every consumer as a type error — follow
  the errors rather than grepping.
- A role that ends up with an empty perm set is a **degenerate role**: it still
  passes `isValidRole` but grants nothing. Check the drop-safety of a role before
  removing its last permission.

## Consumers (why changes here are wide-blast)

`apps/backstage` (nav gating in `nav-config.ts`, the command menu, the
permissions UI's effective-preview, per-feature `useCan` checks),
`apps/beacon` (claims-sync resolves and writes the `perms` custom claim), and the
rules test suite, which builds claims through the **real** seed producer so a
drift between seed and rules fails a test rather than production.

## Rules

- Changing built-in role perms, adding a conditional grant, or touching the cap:
  run the full authz suite (`@luminova/auth`, `packages/types`, backstage, beacon,
  `tests/firestore-rules`) — they cross-check each other by design.
- Never widen a grant to make a test pass. Narrow the test or fix the caller.
- No barrel file; import the subpath. No `any`, no unjustified `as`.
