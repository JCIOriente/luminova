# Dynamic Roles & Permissions — Design

Date: 2026-06-21
Status: Approved (brainstorming) → ready for implementation plan
Scope: `apps/backstage`, `apps/beacon`, `firestore.rules`, `@luminova/auth`, `@luminova/types`

## Goal

Make authorization editable at runtime without a code deploy. An Admin can:

1. **Create custom roles** with a chosen set of permissions.
2. **Edit the coarse permissions of the built-in roles.**
3. **Assign custom roles and per-member permission overrides** to individual members.

Enforced consistently **client-side (CASL)** and **server-side (`firestore.rules`)**.

## Decisions (locked in brainstorming)

| # | Decision |
|---|----------|
| 1 | Full dynamic: author new roles, edit built-ins' coarse perms, per-member overrides. |
| 2 | Permissions are **coarse `action:Subject`** only. The built-in roles' **conditional** logic (own-profile, scanner-events, initiative-direction) stays hardcoded and is **not** editable. |
| 3 | **Decoupled direct assignment**: new `Member.roleIds` + `Member.permissionOverrides`; positions still confer built-in roles via the existing grant pipeline (unchanged trust gate). |
| 4 | **Admin-only** authority for all role/assignment management. No delegation, so no escalation surface. |
| 5 | Built-in roles: coarse perms **editable**; conditional logic + the **Admin** role **locked**; built-ins cannot be deleted. |
| 6 | Permissions are **readable full strings** (`"manage:Member"`); `manage:X` collapses CRUD. A **hard cap of 30 effective perms** per member, enforced in the admin UI and as a fail-closed backstop in the beacon trigger. No short codes, no registry, no codegen-drift gate. |

## Permission vocabulary

```
Action  = "manage" | "create" | "read" | "update" | "delete" | "checkIn"
Subject = "Member" | "Ally" | "Event" | "PointRule" | "MemberPoints"
        | "Payment" | "Attendance" | "Program" | "Project" | "Activity"
        | "Position" | "Role" | "all"
PermissionCode = `${Action}:${Subject}`   // e.g. "manage:Member", "read:Payment", "manage:all"
```

- `manage:X` implies `create|read|update|delete` on `X` (CASL semantics; rules expand explicitly — see §Rules).
- `manage:all` is Admin's single perm.
- `Role` subject gates the permissions admin surface itself (`manage:Role`), held only by Admin in the MVP (Admin has `manage:all`).
- The set is finite and small (13 subjects × 6 actions), so a cap of 30 cannot be reached in normal use — Admin = 1 perm; a heavy custom role with `manage` on every subject ≈ 13.

## Claims shape

Custom claims carry **two** fields (Firebase 1000-byte limit):

```jsonc
{
  "roles": ["Member", "Scanner"],        // built-in role NAMES only; drives conditional rules + /me routing
  "perms": ["manage:Member", "read:Payment"], // RESOLVED effective coarse set, all sources unioned
  "scannerEventIds": ["..."]             // unchanged, Scanner-only
}
```

- Custom roles **never** appear in `roles` — they have no conditional logic; their power is fully captured in `perms`.
- `perms` is the union of: built-in role perms (for roles the member holds via positions) ∪ custom role perms (via `roleIds`) ∪ `permissionOverrides.grant`, minus `permissionOverrides.revoke`.
- Byte budget: ~200 B reserved for `roles` + `scannerEventIds` + JSON overhead; ~800 B for `perms`; longest code ≈ 22 B with quoting → ≥ 36 codes fit. Cap of 30 keeps a safe margin.

## Data model — `@luminova/types`

New collection `roles/{id}`:

```ts
interface RoleDefinition {
  id: string;
  name: string;            // Spanish display label, e.g. "Coordinador de Eventos"
  description: string;
  builtIn: boolean;        // true for the 7 seeded roles
  builtInKey: Role | null; // built-ins: the Role name they map to (links to conditional logic); custom: null
  permissions: PermissionCode[];
  locked: boolean;         // true ONLY for the Admin role (no edit/delete)
  active: boolean;
  deletedAt: Timestamp | null;
}
```

`Member` gains two optional fields:

```ts
roleIds?: string[];                                   // custom role ids assigned directly
permissionOverrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
```

Zod schemas added for both, validating `PermissionCode` membership in the known vocabulary. `RoleDefinition.name` non-empty; `permissions` deduped; built-in roles' `builtInKey` required when `builtIn`.

## Effective-perms resolution — `@luminova/auth`

A pure function, shared by CASL and the beacon trigger:

```ts
resolveEffectivePerms(input: {
  builtInRoleNames: Role[];                 // from positions, post trust gate
  roleDocs: RoleDefinition[];               // every role the member effectively has (built-in by builtInKey + custom by roleIds)
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[]
```

- Union all `roleDocs[].permissions`, add `overrides.grant`, remove `overrides.revoke`, dedupe, sort (stable for idempotent claim equality).
- Returns the effective coarse set. The caller enforces the cap.

`buildAbility(claims, uid)` becomes:

- expand `claims.perms` → `can(action, subject)` (with `manage` expansion handled by CASL natively);
- **plus** the existing conditional grants derived from `claims.roles` + `uid` + `scannerEventIds` (Member own-profile read/update, Scanner checkIn scoped to events, etc.).

The 20 existing call sites are untouched (same `ability.can(...)` / `<Can>` API).

## Claims sync — `apps/beacon`

`syncMemberClaims` extends:

1. Compute built-in role names from `member.positions` via the **existing** `resolveTrustedGrants` (assignedBy Admin-trust gate **unchanged**), always include `Member`, preserve `Scanner`.
2. Fetch role docs: built-ins by `builtInKey ∈ builtInRoleNames`, customs by `id ∈ member.roleIds`.
3. `perms = resolveEffectivePerms(...)`.
4. **Cap guard**: if `perms.length > 30`, log an error and **skip the claims write** (fail-closed — never truncate; truncation could drop a `revoke` and grant power). Existing claims remain.
5. Write `{ roles: builtInRoleNames, perms, scannerEventIds? }`. Idempotent: skip if unchanged.

New trigger **`onRoleWritten`** (`roles/{id}`): when a role doc changes, re-sync every member who effectively holds it (custom: `roleIds array-contains id`; built-in: members whose positions confer `builtInKey`). Batched; fan-out cost is acknowledged (role edits are rare, Admin-only). Deletes of a custom role also re-sync affected members.

New **admin-only backfill callable** `recomputeAllClaims` to populate `perms` for every existing member at rollout (see §Rollout).

## `firestore.rules`

- New helper:
  ```
  function perms() { return request.auth.token.perms; }
  function hasPerm(p) { return signedIn() && perms() != null && perms().hasAny([p]); }
  function canDo(action, subject) {
    return hasPerm('manage:all')
        || hasPerm('manage:' + subject)
        || hasPerm(action + ':' + subject);
  }
  ```
- Coarse collection gates migrate `hasAnyRole([...])` → `canDo('update','Member')` etc. Readable, audit-friendly.
- **Conditional special-cases stay** keyed on `roles`/`uid`: member self profilePicture update, EC position-only update, scanner checkIn eventId scope, initiative-direction writes.
- New `roles/{id}`: read = `signedIn()`; write = Admin only (`hasPerm('manage:all')`).
- `members/{id}` update: non-Admin writes must leave `roleIds` and `permissionOverrides` **unchanged** (same immutability pattern as `uid`/`totalPoints`). Only Admin may set them.

## Admin UI — `apps/backstage` (`/permisos`, already gated `manage:all`)

- **Roles list**: built-in vs custom badge; create-role button.
- **Role editor**: name, description, a subject × action permission **matrix** (checkboxes); built-in conditional perms shown read-only/locked; Admin role fully locked; live perm-count vs cap.
- **Member assignment** (member detail tab or drawer): custom-role multiselect (`roleIds`) + override grant/revoke pickers + a **read-only effective-perms preview** computed client-side; blocks save if effective > 30.
- `RoleRepository` (CRUD on `roles/`) + member-update mutations for `roleIds`/`permissionOverrides`.

## Rollout & migration (phased — order matters; repo has no CI)

1. **Seed** `roles/` with the 7 built-ins + their current coarse perm mappings (derived from today's `applyRole`), `builtInKey` set, Admin `locked`.
2. **Backfill**: run `recomputeAllClaims` so every member gains a `perms` claim **while rules are still role-based**.
3. **Then** deploy the perm-based rules. This ordering avoids a window where perm gates deny everyone.

## Slicing — 4 stacked PRs

1. **types + auth** — `RoleDefinition`/`PermissionCode`/`Member` fields + Zod; `resolveEffectivePerms`; `buildAbility` perm-expansion (back-compatible: if `perms` absent, fall back to deriving from `roles` so nothing breaks pre-backfill).
2. **beacon** — `syncMemberClaims` resolution + cap guard + `onRoleWritten` + `recomputeAllClaims` callable + seed.
3. **rules** — `canDo`/`hasPerm` gates + `roles/` collection rules + `roleIds`/overrides immutability (deploy after backfill).
4. **admin UI** — roles CRUD + member assignment + effective preview.

## Verification (per slice)

- TDD throughout.
- `@luminova/auth`: `resolveEffectivePerms` (union/grant/revoke/dedupe/cap), `buildAbility` from perms + conditional, back-compat fallback.
- `apps/beacon`: resolution wiring, cap fail-closed, `onRoleWritten` fan-out, idempotency, seed correctness — `firebase-functions-reviewer`.
- `firestore.rules`: rules-unit tests for every migrated gate + admin-only `roles/` writes + `roleIds`/overrides immutability for non-Admin + escalation attempts — `firestore-security-reviewer`.
- `apps/backstage`: role editor, member assignment, effective-perms preview + cap block.
- `/security-review` on every slice touching auth/rules/functions.

## Non-goals (YAGNI)

- Delegated (non-Admin) permission management — Admin-only for now; data model leaves room.
- Conditional/ABAC custom permissions — built-in conditions stay hardcoded.
- Per-resource (row-level) grants beyond the existing hardcoded conditions.
- Short-code encoding / registry / codegen-drift gate — dropped in favor of readable strings + cap.
