# Role display — single source of truth

**Status:** approved, in implementation (PR 1 of 4)
**Date:** 2026-08-02

## Problem

`/permisos` renders a role's name from three places that disagree.

| Source | Says for `ProjectManager` |
|---|---|
| `apps/backstage/src/features/positions/lib/permission-labels.ts` (`PERMISSION_ROLE_INFO`) | "Proyectos" |
| `packages/types/src/role-definition.ts` (`ROLE_LABELS`, seed-only) | "Director de Proyecto" |
| live `roles/ProjectManager.name` doc | "Proyecto" (drifted in prod) |

The page's top panel, the cargo grants picker (`position-form.tsx`), the cargo table
(`position-table.tsx`) and the member panel all read the **hardcoded map**. The bottom
panel (`role-manager.tsx`) reads the **live docs**. Same role, two names on one screen.
An admin renaming a role in the editor sees nothing change in the cargo picker.

A fourth copy exists: `tools/scripts/lib/role-seed.mjs` hand-mirrors `ROLE_LABELS` for
the plain-Node seed scripts, guarded by `packages/types/src/role-definition.mirror.test.ts`.

## Non-goal

Collapsing every role-shaped constant into one. Some are irreducible and saying otherwise
would be a lie:

| Site | Verdict |
|---|---|
| `ROLES` union (`permission-role.ts`) | **Irreducible.** Compile-time key set; feeds `z.enum(ROLES)` in `position-schema.ts`, `isValidRole`, the CASL switch. |
| `BUILT_IN_ROLE_PERMS` / `ROLE_LABELS` / `ROLE_DESCRIPTIONS` | **Bootstrap snapshot.** Read only when a role doc does not exist (fresh project, pre-seed). Legitimate, but must be labelled as such and have exactly one consumer per package. |
| `roles/{id}` docs | **The runtime authority.** What every surface renders. |
| `applyConditional` (`packages/auth/src/ability.ts`) | Object-scoped grants, deliberately not UI-editable. Out of scope here. |
| `tools/scripts/lib/role-seed.mjs` | Mirror of the snapshot, already guarded by a mirror test. |

What this spec **does** guarantee: there is exactly one way for a UI surface to obtain a
role's Spanish name or description, and it reads the live doc.

## Design

### `roleDisplay` / `roleOptions`

One helper at `apps/backstage/src/lib/role-display.ts`, the only module in backstage
permitted to import the snapshot constants.

- `roleDisplay(key, roleDocs)` — resolves the live built-in doc by `builtInKey`; falls
  back to `ROLE_LABELS` / `ROLE_DESCRIPTIONS` only when no doc exists. Uses `||`, not
  `??`, because seeded docs carry `description: ""` today.
- `roleOptions(roleDocs)` — option list for a role picker, derived from **`ROLES`**, not
  from the doc list.

`roleOptions` deriving from `ROLES` is load-bearing, not stylistic. If options came from
the doc list, then a role doc that is missing (pre-seed) or inactive (after the lifecycle
PR) would drop its option — and `MultiSelect` renders chips by filtering `options` against
the stored value (`packages/ui/src/components/multi-select.ts:11`). An admin opening a
cargo would see one of its two grants, with the hidden one still live in `positions.grants`.
Deriving from `ROLES` makes the option list total, so a stored grant is always visible and
the fallback label is the worst case rather than silence.

The same property removes any loading-state hazard from the picker and the cargo table:
labels degrade to the snapshot while `useRoles()` is in flight, they never vanish.

### `ROLE_DESCRIPTIONS`

The Spanish descriptions exist **only** in the file being deleted. `ROLE_LABELS` is
labels-only and `buildBuiltInRoleDocs` seeds `description: ""`, so production role docs
have blank descriptions. Add `ROLE_DESCRIPTIONS: Record<Role, string>` next to
`ROLE_LABELS`, carry the exact existing Spanish text, mirror it into `role-seed.mjs`, and
have both seeders write it.

### Merged `/permisos`

Two panels collapse into one list, one row per role doc.

```ts
interface RoleOverviewRow {
  role: RoleDefinition | null; // null = built-in key with no seeded doc
  id: string;
  builtInKey: Role | null;
  label: string;
  description: string;
  permissions: PermissionCode[];
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}
```

The row carries **resolved display text**, not the doc. A panel reading `role.name` /
`role.description` off the doc reintroduces the bug from the other end: production
built-in docs carry `description: ""` (seeding is `create()`-only and backfills nothing),
so `/permisos` would render every built-in with no description while the member panel,
going through `roleDisplay`, shows the snapshot text. Same role, two screens, two answers.

Correctness constraints the old `buildPermissionsOverview` did not meet:

1. **"Otorgado por" is meaningless for a custom role.** `Position.grants` is
   `z.array(z.enum(ROLES))`, so a custom role's doc id can never appear in it. Custom
   roles are assigned through `members.roleIds`. Rows for custom roles render
   "Asignación directa", not an empty cargo list.
2. **Holders are a union, not an XOR.** `effectiveRoles` reads only
   `member.positions[term].cargoId`; `members.roleIds` is the other path. It is not the
   custom-role path *exclusively* — beacon's `getRolesByIds` resolves a built-in doc id
   too, so `roleIds: ["Admin"]` genuinely mints `manage:all`. Every row unions both, so a
   directly-assigned Admin is never invisible on the page that lists Admin's holders. A
   member holding a role by both paths still counts once.
3. **A `ROLES` key with no doc still gets a row**, marked "sin sincronizar", labelled from
   the snapshot and showing the perms it currently mints (`BUILT_IN_ROLE_PERMS`). It is
   offered as a cargo grant and minted through beacon's fallback the moment it exists in
   the union — dropping it from the page whose entire job is "who can do what" until
   someone runs `seedRoles` would hide a live power grant. Such a row has no doc to write
   to, so it renders no editor. This is why `buildRoleOverview` iterates `ROLES` as well
   as the doc list, mirroring `roleOptions`.

Holders render truncated — first 5, then "y N más" — because the `Member` row lists the
entire chapter.

The page owns all three queries (`useRoles`, `usePositions`, `useMembers`) and renders one
loading state and one `QueryErrorState`. Today `RoleManager` runs its own `useRoles` with
its own branches, so one outage paints two error blocks. There is deliberately **no** empty
state: constraint 3 means the row list is never empty, so the pre-seed condition renders as
seven "sin sincronizar" rows — strictly more informative than a blank page.

### Guard

`role-display.guard.test.ts` walks `apps/backstage/src/**` and asserts:

1. No file other than `lib/role-display.ts` imports `ROLE_LABELS` or `ROLE_DESCRIPTIONS`.
2. No file other than `lib/role-display.ts` contains an object literal binding **3 or
   more** role keys to string literals — quoted (`"Admin":`) or bare. The threshold is 3,
   not all 7, because the map that caused the bug listed exactly the five roles the old
   `/permisos` rendered (`ROLES` minus `Member`/`Scanner`); an all-keys predicate would
   have walked straight past it. `// role-labels-guard: allow` within three lines above a
   literal opts it out, so the next legitimate per-role config (an icon map, a nav-target
   map) does not fail CI naming a bug it isn't.
3. No file other than `lib/role-display.ts` contains a multi-word canonical label
   (derived as `Object.values(ROLE_LABELS).filter((l) => l.includes(" "))`), matched as a
   complete quoted string.

**What this guard does not catch.** The claims above were replayed against synthetic
inputs (`describe("maxRoleEntriesPerObject")` in the guard file, including two explicit
"does NOT catch" cases) rather than assumed, so this list is measured:

- a `switch (role)` returning labels;
- an array of `[role, label]` tuples, or a `Map` built from one;
- a map of only one or two roles;
- a single-word label typed inline;
- a namespace import (`import * as T`) or a re-export from another package.

An eslint `no-restricted-imports` rule was considered and rejected — the file that caused
this bug imports only `import type { Role }` and would have scored clean on the day it was
written. The guard is a tripwire for the shape that already shipped, not a proof. The
structural protection is that `roleDisplay`/`roleOptions` are the only way to obtain a
label, so a hand-typed map has no call site to plug into.

## Out of scope (later PRs)

| PR | Scope |
|---|---|
| 2 | New built-in role set (adds `ActivityManager`, `Secretary`) + the reseed callable. Reseed writes `permissions` only — **never** `name`/`description`, so an admin rename is permanent. |
| 3 | Built-in role rename + deactivate lifecycle, incl. the absent-vs-inactive claims fallback and a reactivate path. |
| 4 | `canAssignBoardPositions` role flag. |

Two findings from the adversarial review land outside all four and need their own fix:
`positionsAssignmentSafe()` gates the incoming cargo but not the one being replaced (any
`Membership` holder can strip an Admin), and the Scanner check-in arm's `role == 'Attendee'`
conjunct is bypassable once Scanner holds a coarse `checkIn:Attendance`. Both are tracked
for PR 2, where the rules already change.
