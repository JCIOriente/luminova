# Cargos, Comisiones & Permisos refinement — Design (2026-06-11)

## Problem

The `/positions` ("Cargos y comisiones") surface conflates three different
things in one flat table (`Cargo · Variante femenina · Categoría · Gestión ·
Permisos`):

1. **Comisiones are not cargos.** CCE (Conducta y Ética), CRE (Reforma
   Estatutaria), CIE (Innovación y Emprendimiento) are working groups a member
   *belongs to* — not titles. A plain member (Ana) can be in CCE + CIE; a
   CEL/JDL holder can also belong to comisiones. Yet they render with a
   "Variante femenina" and "Permisos" column that make no sense for them.
2. **Gendered cargo naming is clumsy.** Two free-text columns (`title` /
   `titleFemale`) force typing each name twice and clutter the table. The
   variants are mostly regular (Presidente/Presidenta, Tesorero/Tesorera,
   Director/Directora).
3. **Permissions management is invisible.** Permissions exist only as the
   `grants` field buried inside a cargo's edit sheet. There is no surface that
   answers "who can do what". An Admin (the president) sees no obvious
   permissions management.

## Decisions (locked with user)

1. **Comisiones — refine in place.** Keep ONE `positions` collection; the
   `category` discriminator drives shape and presentation. No separate
   collection, no rules/trigger migration. A member keeps one `cargoId` (single
   CEL/JDL post) and an independent `comisionIds[]` (any number of comisiones).
2. **Cargo naming — store one name, derive the feminine.** Store only `title`
   ("Presidente"); derive "Presidenta" at display from member gender. An
   optional `titleFemale` override covers irregular words. One catalog column.
3. **Permisos — a read-focused overview page.** `/permisos` shows each role →
   description → which cargos grant it → who currently holds it. Editing stays on
   the cargo (permissions MUST flow cargo → grants → claims, per the K4 trust
   model). Direct person↔role assignment is out of scope.

## Components

### 1. Types — `packages/types/src/position.ts`

- `Position.titleFemale` becomes **optional** (`titleFemale?: string`) — an
  override, not a required field. Existing docs that have it keep working (their
  value is now treated as the override).
- Add `Position.sigla?: string` — the comisión acronym (e.g. `"CCE"`). Unused for
  CEL/JDL.
- New pure helper:
  ```ts
  /** Derive the feminine form of a role title: feminize the FIRST word
   *  (-o→-a, -e→-a, else +a) and keep the rest. Irregular multi-word titles
   *  (e.g. "Pasado Presidente") need an explicit titleFemale override. */
  export function femaleTitle(title: string): string {
    const [first, ...rest] = title.split(" ");
    let f: string;
    if (/o$/.test(first)) f = first.replace(/o$/, "a");
    else if (/e$/.test(first)) f = first.replace(/e$/, "a");
    else f = first + "a";
    return [f, ...rest].join(" ");
  }
  ```
- `positionTitle(position, gender)` becomes:
  female → `position.titleFemale ?? femaleTitle(position.title)`; otherwise
  `position.title`. (Signature unchanged — all existing callers benefit.)
- `positionSchema` (`packages/types/src/position-schema.ts`, tested in
  `position-schema.test.ts`): `titleFemale` optional; add optional `sigla`. Also
  loosen `positionTitle`'s `Pick<Position, "title" | "titleFemale">` param since
  `titleFemale` is now optional. A `superRefine`:
  - `category === "Comision"` → `grants` must be `[]`, `titleFemale` empty/undefined,
    `term` null; `sigla` required (non-empty).
  - `category !== "Comision"` → `sigla` empty/undefined.

### 2. Position form — `apps/backstage/src/features/positions/components/position-form.tsx`

Category-aware fields (driven by `watch("category")`):

- **CEL / JDL:**
  - `title` — label "Cargo".
  - Collapsible **"Variante femenina (opcional)"** showing the derived suggestion
    `femaleTitle(title)` as placeholder/help; the input is only persisted when the
    user types an override (empty input → store `undefined`, display derives).
  - `grants` — "Permisos que otorga" (Admin-only, unchanged).
  - `term` — "Gestión" (JDL only, unchanged).
- **Comisión:**
  - `title` — label "Nombre".
  - `sigla` — "Sigla" (e.g. CCE), required.
  - NO gender field, NO permisos (form forces `grants: []`).
- `description` — kept for all.

### 3. Catalog page — `apps/backstage/src/routes/_app.positions.tsx` + `position-table.tsx`

Replace the single flat table with **three sections**: **Cargos (CEL)**,
**Direcciones (JDL)**, **Comisiones**. Implement as a `PositionSection`
component rendered three times (filtered by category) rather than one table —
each section can have its own columns:

- Cargos/Direcciones table: `Cargo` (single column, `position.title`; JDL adds
  `Gestión`) · `Permisos` · `Acciones`. The "Variante femenina" column is gone.
- Comisiones table: `Sigla` · `Nombre` · `Acciones`. No gender, no permisos.

Each section shows its own `EmptyState` when empty. The "Nuevo cargo" button may
stay a single action opening the form (category chosen inside), or become
per-section "Nuevo" buttons that preset the category — implementer's choice,
default to a single button to minimize churn.

### 4. Member views — comisión as membership

- `member-form.tsx`: the comisión `MultiSelect` stays (writes `comisionIds`);
  relabel "Comisiones (pertenece a)"; option labels show `SIGLA — Nombre` when a
  sigla exists (fall back to title).
- Member profile / team rail chips (`member-position-history.tsx` and/or the
  team rail): render assigned comisiones as **"Pertenece a: CCE, CIE"** using
  sigla. Cargo display already routes through the now-derive-aware
  `positionTitle`.

### 5. Permisos overview — `/permisos` (NEW)

- Route `apps/backstage/src/routes/_app.permisos.tsx`; nav item "Permisos"
  (icon e.g. `shield`/`key`) gated `roles: ["Admin"]`.
- Reads: `usePositions()` (all) + `useMembers()` (all). For each role in a curated
  list (`Admin`, `Membership`, `Treasury`, `ExecutiveCommittee`, `ProjectManager`
  — exclude `Member`/`Scanner` as not cargo-granted), render a card:
  - role label + description from `PERMISSION_ROLE_INFO`.
  - **Otorgado por:** the cargos whose `grants` include the role (by `title`).
  - **Lo tienen:** members whose effective roles include it, computed with the
    existing `effectiveRoles(member, positionsById, currentTermKey())` from
    `apps/backstage/src/features/members/lib/member-permissions.ts`.
  - "Editar permisos →" linking to `/positions` (or the specific cargo edit).
- Pure helper `buildPermissionsOverview(positions, members, termKey)` returning
  `{ role, label, description, grantingCargos: string[], holders: {id,name}[] }[]`
  — unit-tested in backstage; the route is thin presentation.

## Data flow

```
catalog form → positions/{id} (title, titleFemale?, sigla?, grants, category, term)
member form  → members/{id}.{cargoId, comisionIds[]}
display      → positionTitle(pos, member.gender)  // derives feminine
/permisos    → read positions + members → buildPermissionsOverview → cards
```

## Error handling / edge cases

- `femaleTitle` is a best-effort suggestion + display fallback. Irregular titles
  (multi-word like "Pasado Presidente", invariant nouns like "Vocal") are handled
  by the optional `titleFemale` override; the CEL seed already carries correct
  overrides for its irregulars.
- Comisión with no sigla: schema requires it on create; legacy comisión docs
  lacking sigla fall back to `title` in displays (defensive render).
- `/permisos` "Lo tienen" reflects the member docs' current-term positions; a
  member whose claims haven't refreshed yet still appears (it reads positions, not
  live claims) — consistent with how the member panel already works.

## Testing

- **Types (`packages/types`):** unit-test `femaleTitle` (Presidente→Presidenta,
  Tesorero→Tesorera, Director→Directora, Asesor→Asesora, "Vicepresidente de
  Área"→"Vicepresidenta de Área") and `positionTitle` override-vs-derive.
- **Position schema:** comisión-requires-sigla / forbids-grants; cargo-forbids-sigla.
- **Backstage:** position-form category-conditional fields (jsdom); the three
  catalog sections render the right columns; `buildPermissionsOverview` pure test;
  member comisión chips show siglas.
- All existing tests stay green (`positionTitle` signature unchanged).

## Security

No `firestore.rules` change (only new optional fields; `/permisos` is read-only
over collections an Admin already reads). Because the change surfaces
role/permission data, run `/security-review` + `firestore-security-reviewer` at
the end. Confirm: no new write path bypasses the cargo→grants trust model, and the
`/permisos` route is Admin-gated in nav AND the data it reads is already
Admin-readable (no privilege leak to lower roles).

## Slices (implementation order)

1. **Types + derive** — `femaleTitle`, `titleFemale` optional, `sigla`,
   `positionTitle` update, schema superRefine (+ tests). Foundation.
2. **Position form** — category-aware fields.
3. **Catalog sectioning** — three `PositionSection`s, redesigned columns.
4. **Member comisión views** — sigla chips + relabel.
5. **Permisos page** — `buildPermissionsOverview` + route + nav.

## Out of scope

- Direct person↔role assignment (permissions must flow through cargos).
- Comisión-level permissions (comisiones grant nothing in v1).
- A separate `comisiones` Firestore collection.
- Editing grants from `/permisos` (links out to the cargo instead).
