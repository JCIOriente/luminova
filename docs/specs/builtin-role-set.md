# Built-in role set + reseed + two authorization holes

**Status:** approved, in implementation (PR 2 of 4)
**Date:** 2026-08-03
**Follows:** `docs/specs/role-display-single-source.md` (PR #216, merged)

## Scope

Three things ship together because each is unsafe or pointless alone: the new built-in
role table, the reseed path that makes it reach production, and two pre-existing
authorization holes in the rules and claims code this PR already opens.

## A. The role table

`ROLES` gains `ActivityManager` and `Secretary`.

| key | nombre | permissions |
|---|---|---|
| `Admin` | Administrador | `manage:all` |
| `Membership` | Membresía | `manage:Member`, `read:MemberPoints`, `read:Position` |
| `ProjectManager` | Proyectos | `manage:Project`, `manage:Program`, `manage:Activity`, `checkIn:Attendance`, `read:Ally` |
| `ExecutiveCommittee` | Comité Ejecutivo | `read:Member`, `read:Ally`, `read:MemberPoints`, `read:Program`, `read:Project`, `read:Notification`, `create:Notification`, `read:Lead`, `read:PointRule` |
| `ActivityManager` | Actividades | `manage:Activity`, `checkIn:Attendance` |
| `Scanner` | Escáner | `read:Activity`, `checkIn:Attendance` |
| `Member` | Miembro | `read:Member`, `read:MemberPoints`, `read:Activity`, `read:Program`, `read:Project` |
| `Secretary` | Secretaría | `manage:Notification`, `manage:Lead`, `manage:Ally` |
| `Treasury` | Tesorería | `read:Member`, `read:MemberPoints` |

Every new key needs a `ROLE_LABELS` and a `ROLE_DESCRIPTIONS` entry (both are exhaustive
`Record<Role, string>`, so a miss is a compile error) and a mirror in
`tools/scripts/lib/role-seed.mjs`, guarded by `role-definition.mirror.test.ts`.

### Deltas that darken or light a UI surface

- **`ExecutiveCommittee` loses `manage:Position`**, and the dedicated positions-edit lane in
  `firestore.rules` goes with it. CEL can no longer assign cargos or comisiones to anyone —
  Admin-only until PR 4's flag. **`/positions` stays in CEL's nav allowlist** (decided): the
  collection is `signedIn()`-readable and the row actions already gate on
  `can("update","Position")`, so they keep seeing who holds what, read-only.
- **`Membership` loses the Ally trio** (`read:Ally`, `create:Ally`, `update:Ally`) — Secretaría
  owns allies now. Membership also loses `/allies` from its nav.
- **`Member` does NOT gain `read:PointRule`.** `/point-rules` gates on that perm with no role
  allowlist, so granting it would put the admin page in every member's nav.
- **`Scanner` gains coarse `read:Activity` + `checkIn:Attendance`**, replacing the CASL
  event-scoped conditional. Nobody holds Scanner in production, so there is no migration —
  but see C2: the coarse perm must not be allowed to bypass the Attendee restriction.
- Nothing seeded grants `ActivityManager`. It is meant for a JDL dirección, which is prod
  data created in `/positions`, not seed data.

Cargo mapping: seeded `Secretario` grants `["Secretary", "Membership"]` — the new duties on
top of the member CRUD it already does. Every other CEL cargo unchanged.
`tools/scripts/lib/cel-seed.mjs` mirrors `cel-positions.ts`, guarded by
`cel-seed.mirror.test.ts`; both change together or CI fails.

### Hand-written role lists that two new keys would slip past

None of these is type-checked against `ROLES`. All four must be derived from it in this PR,
**before** the keys are added, so the new roles are covered the moment they exist:

| Site | Failure if left alone |
|---|---|
| `apps/backstage/src/lib/authz/is-member-only.ts:3` — `PRIVILEGED` is a bare `string[]` | A Secretary is classified member-only and bounced from `/` to `/me` every login, despite holding three management capabilities |
| `apps/backstage/src/components/overview/board-home-layout.ts:33` — `Partial<Record<Role,…>>` + `PRECEDENCE` array | `boardHomeLayout` finds no known role, returns `DEFAULT_LAYOUT` (`:55-56`), so a Secretary-only user gets the **full** admin dashboard including KPI and chart widgets whose queries they may not be allowed to run |
| `tests/firestore-rules/nav-equivalence.test.ts` — `PRINCIPALS` literal | The nav⟷rules implication is never checked for either new role |
| `apps/backstage/src/components/nav-config.test.ts` — `ALL_ROLES` literal | Pinned visibility sets never probe the new roles |

`permissions-overview.ts`'s `MANAGED_ROLES` already derives correctly (`ROLES` minus an
explicit unmanaged list). Copy that pattern. `board-home-layout.ts:49-52` already carries a
comment warning about exactly this class of hand-written fixture — it guards roles that are
*in* the map, not roles missing from it.

## B. The reseed callable

`seedBuiltInRoles` uses `create()` and swallows `ALREADY_EXISTS`, deliberately, so an
admin's edits survive a re-run. That also means **editing the snapshot does not move
production**. Without a reseed path this PR changes nothing for the live chapter.

- **Writes `permissions` only. Never `name`, never `description`.** The doc owns display text
  (decided). This is precisely what lets the reseed and PR 3's rename feature coexist —
  otherwise an operator re-running the reseed silently reverts every rename.
- Admin-guarded via `requireAdmin`, beside `seedRoles` / `recomputeAllClaims` in
  `apps/beacon/src/recompute-claims.ts`.
- **One `WriteBatch`** — 9 docs, far under the 500 limit. The existing doc-by-doc loop would
  leave half the role set on new perms and half on old, with fan-outs already fired for the
  first half and no rollback.
- **Skips `locked === true`.** The admin SDK bypasses the `locked` rule the client is held to,
  so `roles/Admin` must be excluded explicitly rather than by assumption.
- Requires an explicit `confirm: "overwrite-builtin-roles"` argument. `requireAdmin` is the
  same gate as the read-only admin ops; a destructive one should not be one click away.
- Supports `dryRun`, returning per-doc `{id, current, proposed}` and writing nothing.
- Returns `{applied: [{id, changedFields}], skipped, failed}`, like `recomputeAllClaims` —
  the trigger itself is fire-and-forget, so the callable is the only place an operator can
  see what happened.

**Blast radius, to be documented in `apps/beacon/CLAUDE.md`:** `onRoleWritten` scans the
*entire* members collection for any doc carrying a `builtInKey`. Five roles change perms
here, so that is five full scans × N members of sequential `getUser` plus possible
`setCustomUserClaims`, inside a 540s budget with `retry: false`. A timeout strands the
members not yet reached in that scan. Operator instruction: run `recomputeAllClaims`
afterwards as the observable backstop. Re-running the reseed is free — `roleClaimsChanged`
short-circuits a no-op write.

## C. Two pre-existing holes

### C1 — `positionsAssignmentSafe()` never checks the cargo being replaced

`assignedCargoId()` reads `request.resource.data` — the *post-write* cargo. Nothing looks at
`resource.data.positions[term].cargoId`. So any `manage:Member` holder can overwrite the
president's `positions.<term>` with a grant-free cargo. `resolveTrustedGrants` then sees
`grants.length === 0`, returns `[]`, and the president's `Admin` claim is gone. Strip both
Admins and recovery requires the Firebase console.

The comment at `apps/beacon/src/claims-sync/sync.ts:38-42` asserts "rules already deny
non-Admin writes while a power cargo is assigned". That is false: the rules deny *assigning*
a power cargo, not *overwriting* one. Fix the comment with the rule.

```
function currentCargoGrantsEmpty() {
  let prior = resource.data.get('positions', {}).get(currentTermKey(), {}).get('cargoId', null);
  return prior == null
    || get(/databases/$(database)/documents/positions/$(prior)).data.grants.size() == 0;
}
```

Required alongside the existing new-side guard: `hasAnyRole(['Admin']) || (cargoGrantsEmpty() && currentCargoGrantsEmpty())`.
Rules test: "denies a Membership user replacing an Admin-granting cargo with a grant-free one."

### C2 — coarse `checkIn:Attendance` bypasses the Scanner Attendee restriction

The checkIns create rule is `canDo('checkIn','Attendance') || (hasAnyRole(['Scanner']) && role == 'Attendee' && <assigned event> && …)`. Giving Scanner the coarse perm satisfies the
first arm, so the `role == 'Attendee'` clause is never evaluated. A scanner could write
`{memberId: self, activityId: any, role: "Director"}` — 5 pts for `DirectActivity`, 10 for
`DirectProgram`, against 3 for `AttendActivity` — and, through the matching delete arm,
remove a real director's 10-point row.

Keep the restriction as a Scanner-specific conjunct, independent of where the perm came from:

```
&& (!hasAnyRole(['Scanner'])
    || canDo('manage','Attendance')
    || request.resource.data.role == 'Attendee')
```

Scanner event *scoping* is being abandoned deliberately. So `set-user-roles.ts`'s
`scannerEventIds` validation and `ability.ts`'s conditional grant become dead configuration
implying a guarantee nothing enforces — remove them in this PR rather than leave a
guardrail-6 lie.

## Deploy ordering

Rules and functions deploy separately; one PR is not one atomic deploy.

1. Deploy **functions** — the new callable and the `sync.ts` comment fix.
2. Run the **reseed**, then `recomputeAllClaims` to verify and catch stranded members.
3. Deploy **rules** last.

Rules-before-reseed leaves a window where the CEL positions lane is gone while CEL role docs
still carry `manage:Position`, so the positions-only form renders for CEL users whose writes
are already denied — render-then-die.

## Related owner-op

In production the **Secretario cargo grants `Admin`** — widened by hand; the seed only ever
gave it `Membership`. The user has decided to remove it. That is a `/positions` edit, not a
code change: `positions.grants` writes are Admin-role-only. Unrelated to the reseed, which
never touches `positions`.
