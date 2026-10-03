# @luminova/auth — Claude Code Guide

## Purpose

Authorization vocabulary for both frontends and beacon: `roles`, `perms`, and the CASL ability (`can(action, subject)`). Owns **no data** — it reads claims minted elsewhere.

`packages/auth/**` is on the review router's **hard-gated auth surface** (`.claude/review-routing.json`): `gh pr create` is blocked until a fresh `Reviews:` trailer covers `security-review`. Verify with `.claude/hooks/route.sh`.

## Entry points (no barrel — import the subpath)

| Import | Exports |
|---|---|
| `@luminova/auth/roles` | `AuthClaims`, `Role`, `ROLES`, `isValidRole`, `hasRole`, `hasAnyRole` |
| `@luminova/auth/ability` | `buildAbility`, `subject`, `AppAbility`, plus `Action`/`Subject` re-exported from `@luminova/types` |
| `@luminova/auth/perms` | `resolveEffectivePerms` |
| `@luminova/auth/built-in-perms` | `resolveBuiltInPerms`, `BuiltInRoleDoc` — the ONE absent/live/inactive three-way over fetched role docs, shared by beacon claims-sync and the backstage assignment preview |
| `@luminova/auth/test-helpers` | `roleClaims` — mints `{roles, perms}` the production way |

- Runtime exports resolve to `dist/*.js`: a **fresh worktree must build this package before an app's vitest run** (unbuilt `dist` fails as module resolution in the consumer).
- `Action`, `Subject`, `PermissionCode` are defined in `packages/types/src/permission.ts`, not here — edit there.
- `@casl/ability` is exact-pinned (security-critical); changing the pin goes through `secure-dep-vetting`.

## The two-layer model

Never conflate the two claims:

1. **Coarse perms** (`claims.perms`, `"action:Subject"`) — data-driven, admin-UI-editable; `resolveEffectivePerms` = union of role permissions + `overrides.grant` − `overrides.revoke`. Revoke wins.
2. **Conditional grants** (`applyConditional` in `ability.ts`) — hardcoded per built-in role, not UI-editable:
   - object-scoped: `Member` `read/update` on its own `uid`;
   - unconditioned reads that look like coarse perms: `Member` gets `read` on `MemberPoints`, `Project`, `Position`. `read:Position` lives ONLY here — it keeps `/positions` visible to board members (every provisioned user holds `Member`). Don't remove it assuming `BUILT_IN_ROLE_PERMS.Member` covers it.

Adding a conditional grant is a code change plus a `firestore.rules` change — never a data change.

## Invariants

- **`resolveEffectivePerms` and `resolveBuiltInPerms` return UNCAPPED sets.** Enforcing `PERMISSION_CAP` (`@luminova/types`) is the caller's job; any new caller of either must enforce it. Current callers:
  - beacon `resolveMemberPerms` → `sync.ts` fails **closed** to `perms: []`; `set-user-roles.ts` throws `internal` over the cap;
  - backstage `previewEffectivePerms` (`features/permissions/lib/effective-preview.ts`) → `member-roles-panel.tsx` disables Save while `effective.length > PERMISSION_CAP`;
  - `roleClaims` — test-only, no cap;
  - `apps/beacon/scripts/seed-roles.ts` — enforces nothing; safe only because it is emulator-only (`assertEmulator()`).
  - `roleDefinitionSchema` (role editor) bounds one role doc's `permissions` array — a different thing, not this resolution.
- Output is **deduped** (beacon's `sameList` compares length then Set membership; a duplicate forces a redundant claim write). Comparison is order-independent; `.sort()` is only for stable diffs.
- **`claims.perms` absent ⇒ zero coarse abilities.** `buildAbility` reads `claims.perms ?? []` — no fallback to `BUILT_IN_ROLE_PERMS`. Tests must mint claims via `roleClaims(...)`; a bare `{ roles: [...] }` fixture is correct only when asserting absence of coarse access or exercising a role-name gate.
- **A perm is not a rules grant.** `can(...)` gates the UI; `firestore.rules` gates the data — mirror per root guardrail #2.

## Gotchas

- **`read:Project` ≠ `read:Program`.** `Member` has `Project`, never `Program`. Don't gate a detail _fetch_ on `can("read", kind)`; fetch unconditionally (reads are signed-in) and gate the **writes**.
- **`BUILT_IN_ROLE_PERMS` is mirrored by the seed scripts.** `tools/scripts/lib/role-seed.mjs` and `tools/scripts/seed-production.mjs` must stay in sync with `packages/types/src/role-definition.ts`; a mirror test in `packages/types` fails CI otherwise. Change both.
- **Dropping a `Subject`:** follow the type errors from the exhaustive `SUBJECT_LABELS` record rather than grepping.
- A role with an empty perm set is **degenerate** (passes `isValidRole`, grants nothing). Check drop-safety before removing a role's last permission.
- **`BoardSeat` / `MemberLogin` are exact-code gates.** `update:BoardSeat` and `create:MemberLogin` are checked with `hasPerm` in `firestore.rules`, beacon `requireAdminOrPerm`, and backstage `useCan` — never `canDo`-style expansion, so `manage:all` does **not** satisfy them. Their other generated codes are inert. See `docs/specs/board-seat-delegation.md`.

## Rules

- Consumers are wide-blast: backstage (`nav-config.ts`, command menu, effective-preview, `useCan`), beacon claims-sync, and `tests/firestore-rules` (builds claims through the real seed producer).
- Changing built-in role perms, adding a conditional grant, or touching the cap: run the full authz suite (`@luminova/auth`, `packages/types`, backstage, beacon, `tests/firestore-rules`).
- Never widen a grant to make a test pass. Narrow the test or fix the caller.
