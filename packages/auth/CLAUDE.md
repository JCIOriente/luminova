# @luminova/auth — Claude Code Guide

## Purpose

The authorization vocabulary shared by both frontends and the functions backend:
who a member is (`roles`), what they may do (`perms`), and the CASL ability that
answers `can(action, subject)`. It owns **no data** — it reads claims minted
elsewhere and turns them into decisions.

`packages/auth/**` is on the review router's **hard-gated auth surface**
(`.claude/review-routing.json`), so `gh pr create` is blocked until a fresh
`Reviews:` trailer covers `security-review`. Verify rather than trust this
sentence: `.claude/hooks/route.sh` prints the mandated set for your diff.

## Entry points (no barrel — import the subpath)

| Import | Exports |
|---|---|
| `@luminova/auth/roles` | `AuthClaims`, `Role`, `ROLES`, `isValidRole`, `hasRole`, `hasAnyRole` |
| `@luminova/auth/ability` | `buildAbility`, `subject`, `AppAbility`, plus `Action`/`Subject` **re-exported** from `@luminova/types` |
| `@luminova/auth/perms` | `resolveEffectivePerms` |

`exports` maps types to `src/*.ts` but runtime to `dist/*.js`, so a **fresh
worktree must build this package before an app's vitest run** — an unbuilt `dist`
surfaces as a module-resolution failure in the consumer, not here.

`Action`, `Subject` and `PermissionCode` are **defined in `@luminova/types`**, not
here — to add or drop one, edit `packages/types/src/permission.ts`. This package
only re-exports them. `@casl/ability` is a direct, exact-pinned dependency (it is
security-critical); changing that pin goes through `secure-dep-vetting`.

## The two-layer model

A member's authority comes from two independent claims, and conflating them is
the mistake to avoid:

1. **Coarse perms** (`claims.perms`, `"action:Subject"` codes) — data-driven,
   editable in the admin UI, resolved by `resolveEffectivePerms` as
   *union of role permissions + overrides.grant − overrides.revoke*. Revoke wins.
2. **Conditional grants** (`applyConditional` in `ability.ts`) — hardcoded per
   built-in role, not UI-editable. Two kinds live here, and the second is easy to
   miss:
   - genuinely object-scoped: `Scanner`'s `checkIn` limited to `scannerEventIds`,
     `Member`'s `read/update` limited to its own `uid`;
   - **unconditioned reads that look exactly like coarse perms but aren't**:
     `Member` also gets `read` on `MemberPoints`, `Event`, `Project`, `Position`,
     and `Scanner` gets `read` on `Activity`. They live in code because
     `BUILT_IN_ROLE_PERMS.Member` is deliberately `[]` — so a Member's read
     access is invisible in the permissions UI and in the role docs. This is
     where the `read:Project` in the gotcha below actually comes from.

`buildAbility` applies perms first, then conditional grants, both derived from
`claims`. Adding a conditional grant is a code change plus a rules change — never
a data change.

## Invariants

- **`resolveEffectivePerms` returns the set UNCAPPED.** Enforcing `PERMISSION_CAP`
  (`@luminova/types`) is the caller's job, and the three callers do not agree:
  beacon's claims-sync is **fail-closed** (`sync.ts`), the backstage role editor
  blocks Save, and `apps/beacon/scripts/seed-roles.ts` enforces **nothing** — it
  writes `perms` straight to `setCustomUserClaims`. That last one is emulator-only
  (`assertEmulator()`), which is the only reason it is not a hole. Any new caller
  must enforce the cap.
- Output is **deduped**, which is what makes the write-skip check work: beacon's
  `sameList` compares length then Set membership, so a duplicate would flip
  lengths and force a redundant claim write. It is **not** order-sensitive — that
  comparison is deliberately order-independent because Auth returns claims in
  arbitrary order. The `.sort()` is for stable diffs and readability, not
  idempotency.
- **`claims.perms` is optional.** Pre-backfill tokens fall back to
  `BUILT_IN_ROLE_PERMS`. Removing that fallback is a deliberate, separately
  tracked migration — it breaks roles-only test fixtures across the repo.
- **A perm is not a rules grant.** `can(...)` gates the *UI*; `firestore.rules`
  gates the *data*. See root `CLAUDE.md` guardrail #2 for the mirror requirement.

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
