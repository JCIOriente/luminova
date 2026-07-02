# Backstage AuthZ ⇄ UX Capability Map

**Date:** 2026-07-01 · **Branch:** `feat/backstage-authz-ux` · **Scope:** `apps/backstage` (frontend only)

Goal: the UI should only offer a mutating action when the caller can actually
perform it. Firestore rules stay the authority; this is a UX/parity pass on top.
Three fix classes:

1. **Never-allowed here → HIDE** the control.
2. **Blocked by a _state_ precondition** (locked / cancelled / finalized / window)
   → keep visible but **DISABLED + reason**, never a dead control.
3. **Every mutation surfaces failure** → `onError` toast, no silent no-op.

## The two authorities

- **Perm gate** — `useAbility().can(action, subject)` reads the `perms` claim
  (coarse `action:subject`), plus conditional grants from the `roles` claim
  (Scanner `checkIn:Attendance{eventId∈scannerEventIds}`, Member self-scope).
- **Role gate** — `hasAnyRole(claims, ['Admin' | 'ExecutiveCommittee' | 'ProjectManager'])`.
  Several rules enforce **role**, not perm: `siteConfig` write, `positions.grants`,
  `roles` CRUD, member `roleIds`/`permissionOverrides`, the EC positions-only lane,
  `featured`, and every beacon `requireAdmin`.

**Core fault line (systemic):** the UI treats `can('manage','all')` as "isAdmin",
but the rules enforce `hasAnyRole(['Admin'])`. `manage:all` **perm** ≠ `Admin`
**role** — a custom role could carry the perm without the role claim, render the
Admin surface, and be denied at write. Fix by gating Admin-power surfaces on the
**role** (matches the nav-config pattern, which already uses `roles: ['Admin']`).

---

## Mismatch register (prioritised by how misleading)

Severity = how convincingly the UI pretends the action will work.

| ID | Area | Control (file:line) | Problem | Class | Sev |
|----|------|--------------------|---------|-------|-----|
| **X1** | site-config | `routes/_app.config.tsx` / `site-config-form.tsx:608` "Guardar cambios" | Whole `/config` editor rendered for **every** authenticated user; `siteConfig/current` is `write hasAnyRole(['Admin'])` only. Non-Admin edits everything, hits Save → **silent** rule denial (no catch). | HIDE (Admin role) + onError | **HIGH** |
| **X2** | members | `member-invite-drawer.tsx:37,133` + `member-row-menu.tsx:44` + `InviteAccess:211` | Invite/"Enviar acceso" gated on `create:Member` / `manage:all` perm, but `provisionMemberLogin` is `requireAdmin` (**role**). Drawer defaults `sendAccess=true`: non-Admin creates the member (allowed) then provision **fails** → generic "no se pudo guardar" while member already exists. `InviteAccess` surfaces **nothing**. | HIDE invite on non-Admin role; split create/invite errors | **HIGH** |
| **C1** | check-in | `features/check-in/components/present-table.tsx:46` "Quitar a {name}" | Remove-X rendered for **every** roster row incl. non-Attendee (director/team). A **Scanner** may delete only `role=='Attendee'` on in-scope events (`rules:373`). Dead X → denied → error toast. | HIDE per-row (`canRemoveEntry`) | **HIGH** |
| **A1** | allies | `ally-table.tsx:86` "Eliminar" | Gated `<Can delete Ally>` but soft-delete is an `update` write → rule `update canDo('update','Ally')` (allies `delete:false`). `update`-only role wrongly denied the button; `delete`-only role sees it but write denied. Also **silent** (`confirmDelete`, no catch). | REGATE to `update:Ally` + onError | MED |
| **A2** | allies | `_app.allies.tsx:54` "Agregar aliado" | Create button ungated (unlike row edit/delete). `create:Ally`-less user sees it; submit denied (form shows generic error). | HIDE (`create:Ally`) | MED |
| **P1** | positions | `position-table.tsx:30` "Desactivar cargo" | Gated `<Can delete Position>` but soft-delete rides `update:Position` (`rules:237`, positions `delete:false`). Action/subject of gate ≠ write. | REGATE to `update:Position` | MED |
| **P2** | point-rules | `_app.point-rules.tsx:32` "Inicializar" | Gated `create:PointRule`, but `seed()` batch also writes `terms/{termId}` = **Admin-only** (`rules:297`). Non-Admin holder sees it; whole batch fails. **Silent** (`seed.mutate`). | HIDE (Admin role) + onError | MED |
| **I1** | initiatives | `initiative-form.tsx:188` "Destacar en /programas" checkbox | `featured` change is `Admin`/`ProjectManager` **role**-only (`featuredUpdateSafe`, `rules:173`). A perm-based `update:Project` role (not Admin/PM) sees & flips it → **entire update denied**. **Silent** (`void handleUpdate`). | HIDE unless `canFeatureInitiatives` (Admin/PM) | MED |
| **M1** | members | `_app.members_.$memberId.tsx:101` positions-only lane | `showPositionsOnly = !canEdit && can('manage','Position')` (perm), but the only rule permitting a positions-only member write is `hasAnyRole(['ExecutiveCommittee'])` (`rules:222`). `manage:Position`-perm-without-EC-role sees the "Cargos" form; every save denied. | REGATE to EC role | MED |
| **M2** | members | `member-mapper.ts:56` `toMemberUpdateDoc` always emits `positions.<term>` | Every member save trips `positionsTouched()`→`positionsAssignmentSafe()`→`(Admin OR cargoGrantsEmpty)`. A `update:Member` (Membership) user editing a **power-cargo** member (e.g. President) is denied **even changing only a phone**. Generic error, no explanation. | Omit unchanged positions from the write (behaviour) + onError | MED |
| **M3** | members | `member-positions-form.tsx:34` / `member-form.tsx:72` cargo combobox | Lists **all** active non-Comisión cargos incl. grant-bearing. A non-Admin (EC) picking a power cargo is denied (`cargoGrantsEmpty`, `rules:81`). No hint which are assignable. | Filter combobox to assignable cargos for non-Admin | MED |
| **AC1** | activities | `activity-card.tsx:87` list "Editar" menu-item | Offered on **Cancelada** activities from the list (only "Cancelar" is status-guarded), while the detail hero hides Edit on Cancelada (`$id.tsx:194`). Self-inconsistent. | HIDE/disable on Cancelada | LOW |
| **SILENT** | initiatives | `use-initiative-photos.ts`, create/update/complete hooks | None define `onError`; every route handler is `void handle…()`. Rule denials swallowed — sheet stays open, no feedback. | onError toasts | MED |
| **SILENT** | activities | `photo-manager.tsx:39,48,70` (`use-activity-photos.ts`) | Galería add/remove/cover/caption use `try/finally` **no catch**, no toast. Gate is correct (`canManagePhotos`); failures silent. **This is the real "Save silently does nothing" surface**, not the Edit form. | onError toasts | MED |
| **SILENT** | members | `use-set-member-status`, `InviteAccess` provision | Status changes + provision `.mutate` with onSuccess only → denied write shows nothing. | onError toasts | MED |

## Refuted / not-a-mismatch (verified)

- **"Edit a closed/locked activity → Save does nothing"** — **not reproducible on the
  detail page.** `handleUpdate` (`_app.activities_.$id.tsx:151`) special-cases
  `ActivityLockedError` **and** toasts every other denial; the only silent branch
  (`if(!canUpdate)return`) is unreachable (Edit renders only when `canUpdate &&
  status!=='Cancelada'`). Locked activities disable `category`+`startAt` so the
  other fields save fine (`activities` update rule has no lock/status guard). The
  actual silent surface is the **Galería** (see SILENT/activities). List-card Edit
  on Cancelada is a separate inconsistency (AC1).
- **Direction-only initiative editor + `featured`** — does **not** see the toggle:
  the edit form is gated on `can('update')`, which they lack; their writes (photos,
  complete) are all rule-allowed. Real exposure is I1 (perm-based update roles).
- **Status→Finalizado without report+impact** — impossible via UI: status Select
  filters `Finalizado`; only the CompletionWizard reaches it, writing the trio
  atomically (satisfies `finalizedRequiresReport`).
- **RoleManager / MemberRolesPanel** — lazy-loaded / read-skipped for non-Admins
  (least-privilege). Gating **realigned perm→role** (`useCan().isAdmin`) so a custom
  `manage:all`-perm-without-Admin-role holder no longer sees a RoleManager whose every
  write the rules deny. `/permisos` and `/positions` (grants editor + CEL seed) carried
  the same `manage:all`-perm holdover — both switched to the role-based capability
  (`isAdmin` / `canAssignPowerGrants`) after the firestore-security-reviewer flagged them.
- **Check-in tab + create controls** — correctly gated: tab uses
  `can('checkIn', subject('Attendance',{eventId:activity.id}))` (resolves the
  Scanner CASL condition); creates always send `role:'Attendee'`. `check-in-window.ts`
  faithfully mirrors `withinCheckInWindow`.
- **Positions create/edit grants** — grants field hidden for non-Admin
  (`canEditGrants={isAdmin}`) and resubmits unchanged, satisfying the rule.

## Under-offered (UI stricter than rule — not misleading, deferred)

- Parent-direction organiser (in `directionUids`, no `update:Activity` perm) can
  update an activity per `activityParentDirection()` and gets photo editing, but the
  **Edit form** button is gated on `canUpdate` only → cannot open it. Rule permits it.
- Latent rule over-permissiveness: `featured:true` is settable at **create** by any
  `create:Project` perm holder (`initiativeCreateAllowed` has no `featured`/role
  gate; the rule comment claiming "Admin/PM-only" is inaccurate). Tightening this is
  a **rules** change (out of this frontend pass; would trip the security gate).

---

## Fix plan (Phase 2)

**Reusable helper** — `apps/backstage/src/lib/authz/`:

- `useCan()` — combines `useAbility()` + the claims exposed by `AbilityProvider`;
  returns `{ can(action,subject), hasRole(roles), isAdmin, canFeatureInitiatives }`.
  One place for perm **and** role gates (rules use both); named capabilities keep
  policy (e.g. featured = Admin/PM) out of scattered role-array literals. Pure
  `buildCan(ability, claims)` seam is unit-tested without React.
- `<ActionGate role={[...]} | when={bool}>` — renders children only when allowed
  (declarative HIDE for the role-based rules). Perm gates keep using the CASL
  `<Can I a>` component; the two mechanisms don't overlap.
- `useDismissingToast(ms)` — route-local auto-clearing toast state (no global
  provider), replacing the copy-pasted state+timer block.
- TDD the predicate helpers (`buildCan`, `canRemoveEntry`, assignable-cargo filter).

**Note on hide-vs-disable:** every never-allowed control in this pass is gated by a
*role* (permanent for the user), so all resolve to **HIDE** for consistency —
including `featured` (Admin/PM-only) and power-granting cargos (filtered out). No
control has a genuine *state* precondition needing disable+reason, so that variant
isn't used here; add it back the day a locked/window-blocked control appears.

**Order** (checkpoint-commit per group, ≤10 files):

1. Helper + tests.
2. HIDE fixes: X1, X2, C1, A1, A2, P1, P2, M1 (regate to correct action/role).
3. DISABLE+reason / data-filter: I1, M3, AC1; behaviour M2 (omit unchanged positions).
4. onError sweep: initiatives, activities Galería, member status/provision, config, seed, ally-delete.
5. `pnpm --filter backstage run ci` + build (index ≤115 gz) → `/simplify` → `/code-review` → PR.

Rules/repository files are **read-only** in this pass; if a predicate forces a
`repositories/*` read, run `/security-review` + `firestore-security-reviewer`.
