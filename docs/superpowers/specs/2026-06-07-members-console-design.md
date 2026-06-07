# Members Console — Design

**Date:** 2026-06-07
**Branch:** `feat/members-console`
**Status:** Draft — pending user review → implementation plan
**Scope:** `apps/backstage` — `/members` list, drawers, row actions. No `@luminova/types` / `firestore.rules` changes.

## 1. Purpose

`Miembros` is the chapter's member-management console: a searchable, filterable,
sortable directory with inline lifecycle actions (invite, edit, provision app
login, activate/deactivate, disaffiliate, soft-delete) handled in-place through a
slide-in drawer and a contextual row menu. No page navigation for these actions —
all in-place, optimistic state, toast confirmations.

This **extends the already-shipped** `/members` CRUD (table, Sheet form,
soft-delete, TanStack Query hooks). It adds the interaction layer (sorting,
segmented status filter, client pagination, filter chips, drawer, ⋯ menu,
optimistic mutations, gender-aware toasts) and a real invite flow.

## 2. Reconciliation with shipped reality

The originating prototype was a standalone mock. This design adapts it to the
real data model, roadmap, and Firestore rules. Key deviations from the mock:

| Mock | Decision | Reason |
|---|---|---|
| Statuses `activo/nuevo/por_renovar/inactivo` | **`Activo / Inactivo / Desafiliado`** (real 3) | `nuevo`/`por_renovar` are dues-lifecycle → roadmap **J4** (not built). `Desafiliado` is real. |
| `area` field (7 areas) | **Dropped** | Not in data model; org structure unspecced. |
| `role` fixed dropdown | **Free-text + datalist suggestions** | Model `role` is free string; preserves custom titles ("Tesorero"). |
| `since`, `initials`, `color` | **Derived client-side** | `since` = year of `joinDate`; initials/color computed, not persisted. |
| "Renovar membresía" action (por_renovar) | **Removed** | Belongs to J4 dues engine. |
| "Reenviar invitación" (nuevo-gated) | **Re-keyed to `!member.uid`** | Real signal = member has no linked Auth account yet. |
| Invite = self-contained, adds no row | **Invite creates a real member row** | Closes the mock's known gap. |
| Hard "Eliminar … removes the row" | **Soft-delete** (`active:false`) | `firestore.rules`: `allow delete: if false`. |
| "Enviar correo" mode/action | **Deferred** | No transactional-email backend exists. |
| Pagination cursor-10 (docs) / mock 8·16·32 | **Client-side 8/16/32** | `getAll()` loads all; chapter is small. |
| `totalPoints` not shown | **`Puntos` column added** (sortable) | Data exists; supports gamification. |

## 3. Data model (no change)

Source of truth: `@luminova/types` `Member`. Relevant fields:

```
id, name, email, role (free string, min 3), status (Activo|Inactivo|Desafiliado),
joinDate: Timestamp, totalPoints: number, uid?: string, active: boolean, deletedAt
```

Display derivations (client-only, not persisted):
- `since` = `joinDate.toDate().getFullYear()`
- `initials` = first letter of first two name words, uppercased
- `color` = deterministic hash of `id` → palette entry (stable per member)

`status` (membership standing, editable) is **orthogonal** to `active`/`deletedAt`
(system soft-delete). A `Desafiliado` member is **not** deleted and still appears.

## 4. Page anatomy (top → bottom)

1. **Header** — eyebrow `{N} miembros` (live, post-filter total uses TOTAL not N);
   title `Miembros`; subtitle; actions `Exportar` (secondary) + `Invitar miembro`
   (primary, `<Can I="create" a="Member">`).
2. **Filter bar** — search field + status segmented control.
3. **Filter meta row** — `Mostrando N de TOTAL`, active-filter chips, "Limpiar todo".
4. **Table** (or skeleton / empty state).
5. **Pager** — range summary, page-size selector, page controls.
6. **Drawer + toasts** on top.

## 5. Search + filtering (two combinable mechanisms, AND logic)

- **Search box** — case-insensitive substring over `name + email + role`
  concatenation. Placeholder `Buscar por nombre, rol o correo…`.
- **Status segmented control** — `Todos / Activos / Inactivos / Desafiliados`,
  each with a live count over the unfiltered set; `Todos` = full count.
- **Active-filter chips** — each constraint a removable token
  (`Estado: Activos`, `Buscar: "ana"`) with its own ✕; "Limpiar todo" resets
  search + status at once. Meta row always shows `Mostrando N de TOTAL`.
- **Auto-reset** — any change to search, status, or page-size jumps to page 1.

(No área filter — area dropped.)

## 6. Table + sorting

Columns: `Miembro` (avatar + name + email), `Rol`, `Estado` (badge), `Desde`,
`Puntos`, trailing actions cell.

- Sortable: `Miembro` (name), `Rol`, `Desde` (numeric), `Puntos` (numeric).
  `Estado` not sortable.
- Click header → asc; click again toggles; arrow icon marks active column + dir.
  Strings use locale-aware compare; `Desde`/`Puntos` numeric.
- Default sort: `name` ascending.

**Status badges:** `Activo` green (with status dot), `Inactivo` gray,
`Desafiliado` red/neutral. Tokens from `@luminova/ui`.

## 7. Pagination

Page sizes 8 / 16 / 32 (default 8). Pager shows `Mostrando X–Y de TOTAL miembros`.
Windowed number strip with `…` truncation when > 7 pages; prev/next disable at ends.
Client-side over the already-loaded `getAll()` result.

## 8. Row action menu (⋯) — context-sensitive

Portaled fixed-position menu; repositions to the button; auto-dismiss on scroll,
resize, outside-click, Esc. Items adapt to member state and permissions:

| Item | Shown when | Effect | Gate |
|---|---|---|---|
| `Ver perfil` | always | open drawer (Ver) | board read |
| `Editar miembro` | always | open drawer (Editar) | update |
| `Invitar a la app` / `Reenviar invitación` | `!member.uid` / `member.uid` set | `provisionMemberLogin({memberId})` | Admin |
| `Desactivar` | `status === Activo` | status → `Inactivo` | update |
| `Reactivar` | `status === Inactivo` | status → `Activo` | update |
| `Desafiliar` (danger) | `status !== Desafiliado` | status → `Desafiliado` (reversible) | update |
| `Eliminar miembro` (danger) | always | soft-delete (`active:false`), row leaves list | Admin/Membership |

Gated items hidden when the user lacks the ability (`<Can>`).

**Gender-aware toasts:** inspect whether the first name ends in `a` →
"desactivada/desactivado", "desafiliada/desafiliado", "eliminada/eliminado".
Cosmetic, retained.

## 9. Member drawer — 2 modes

Slides from right with scrim, staggered field entrance, Esc-to-close.

- **Ver perfil** — read-only: avatar hero + status badge, then
  `Correo / Rol / Miembro desde / Puntos`. Footer: `Editar perfil`
  (switches to Editar). Link to full profile page `/members/$memberId`.
- **Editar miembro** — live-preview header (avatar + name + role update as typed);
  fields `Nombre`, `Correo`, `Rol` (text input + `<datalist>` of common titles:
  Presidente, Vicepresidente, Secretario, Tesorero, Director de área, Coordinador,
  Miembro activo, Aspirante), `Estado` (3). Save disabled until `name.length >= 3`
  and email matches `\S+@\S+\.\S+`. Save → optimistic row update + toast
  `Se guardaron los cambios de {name}`.

(No "Enviar correo" mode — deferred.)

## 10. Invite drawer — 3-stage flow, creates a real member

Slide-in form: live avatar/role preview; fields `Nombre`* , `Correo`*,
`Rol` (text + datalist), `Estado` (default `Activo`), checkbox
**`Enviar acceso a la app`** (default **on**).

- **Validation:** submit disabled until `name.length >= 3` AND email valid.
- **Stages:** `form → creating → done`.
  - `creating`: `MemberRepository.create()` → new doc (`status` selected,
    `totalPoints:0`, `active:true`, no `uid`). If checkbox on, then
    `provisionMemberLogin({memberId})` (Admin-guarded callable; creates Auth
    user + password-reset link).
  - `done`: success screen — `{name} agregado/agregada`; if login provisioned,
    note "recibirá un enlace para crear su contraseña". Actions:
    `Invitar a otra persona` (reset) / `Listo` (close + invalidate query).
- The new row appears in the table immediately (query invalidation / optimistic insert).

(No "mensaje personal" field — no email channel to carry it.)

## 11. System states

- **Loading:** initial mount shows an 8-row skeleton until `useMembers` resolves.
- **Empty (filtered):** "Sin resultados" empty state + "Limpiar filtros" CTA → clear-all.
- **Empty (no members):** distinct empty state + "Invitar miembro" CTA.
- **Toasts:** bottom-stacked, auto-dismiss ~2.8s, check icon, on every mutation.
- **Error:** mutation failure rolls back optimistic state + error toast.

## 12. Permissions

All mutating UI `<Can>`-gated to `Admin`/`Membership` per `firestore.rules`
(`members` create/update). `provisionMemberLogin` is Admin-guarded server-side
(beacon callable). `Eliminar` is soft-delete only — hard delete is impossible
(`allow delete: if false`). `totalPoints`/`uid` never written from the client.

## 13. Out of scope (deferred)

- Dues-driven statuses (`Por renovar`) + auto-lapse + "Renovar membresía" → **J4**.
- `area` field and area filter → until org structure is specced.
- Transactional email ("Enviar correo") → until a beacon email function ships.
- Server-side / cursor pagination → revisit if member count outgrows client load.

## 14. Files (anticipated)

- `apps/backstage/src/routes/_app.members.tsx` — compose header + filters + table + pager + drawer.
- `apps/backstage/src/features/members/components/member-table.tsx` — add sorting, Puntos col, ⋯ menu.
- `member-filter-bar.tsx`, `member-status-segmented.tsx`, `member-filter-chips.tsx`, `member-pager.tsx` (new).
- `member-drawer.tsx` (Ver/Editar) — may absorb `member-form.tsx`.
- `member-invite-drawer.tsx` (new) — 3-stage.
- `member-row-menu.tsx` (new) — portaled context menu.
- `hooks/use-provision-member-login.ts` — already exists; wire to invite + row menu.
- `hooks/use-update-member.ts`, `use-delete-member.ts` — add optimistic update/rollback.
- New: `hooks/use-set-member-status.ts` (or extend update) for desactivar/reactivar/desafiliar.
- `lib/member-display.ts` (new) — initials/color/since derivations + gender-aware toast copy.
- Tests alongside each.
