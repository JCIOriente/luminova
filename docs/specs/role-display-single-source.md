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
  role: RoleDefinition;
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}
```

Two correctness constraints the old `buildPermissionsOverview` did not meet:

1. **"Otorgado por" is meaningless for a custom role.** `Position.grants` is
   `z.array(z.enum(ROLES))`, so a custom role's doc id can never appear in it. Custom
   roles are assigned through `members.roleIds`. Rows for custom roles render
   "Asignación directa", not an empty cargo list.
2. **Holders must union both assignment paths.** `effectiveRoles` reads only
   `member.positions[term].cargoId`. A custom role's holders come from
   `members.roleIds`. Computing holders from cargos alone would report "Nadie aún" for
   every custom role that has holders.

Holders render truncated — first 5, then "y N más" — because the `Member` row lists the
entire chapter.

The page owns all three queries (`useRoles`, `usePositions`, `useMembers`) and renders one
loading state, one `QueryErrorState`, and an explicit empty state for "no role docs yet"
(the real pre-seed condition). Today `RoleManager` runs its own `useRoles` with its own
branches, so one outage paints two error blocks.

### Guard

`role-display.guard.test.ts` walks `apps/backstage/src/**` and asserts:

1. No file other than `lib/role-display.ts` imports `ROLE_LABELS` or `ROLE_DESCRIPTIONS`.
2. No file other than `lib/role-display.ts` contains a multi-word canonical label
   (derived as `Object.values(ROLE_LABELS).filter((l) => l.includes(" "))`), which is how
   a re-declared label map would show up.

**What this guard does not catch**, stated plainly rather than implied away: a
single-word label typed inline, a namespace import (`import * as T`), or a re-export from
another package. An eslint `no-restricted-imports` rule was considered and rejected — the
file that caused this bug imports only `import type { Role }` and would have scored clean
on the day it was written. The structural protection is that `roleDisplay`/`roleOptions`
are the only way to obtain a label, so a hand-typed map has no call site to plug into.

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
