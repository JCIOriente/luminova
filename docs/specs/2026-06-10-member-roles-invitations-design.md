# Member Roles, Invitations & Permissions (K-track) — Design

**Date:** 2026-06-10
**Status:** Approved
**Scope:** apps/backstage, apps/beacon, packages/types, packages/auth, packages/ui, firestore.rules

## Problem

- `Member.role` is a free-form string — no catalog, no gender variants, no link to permissions.
- Invitations don't send email: `provisionMemberLogin` returns a password-reset link the admin shares manually.
- Org structure (CEL / JDL / comisiones) is not modeled; chips, per-term history, and director creation are impossible.
- Permissions (Auth custom claims + CASL) are disconnected from cargos and invisible to admins.
- The `Sheet` pane is hardcoded to `max-w-[440px]`, too narrow for richer forms.

## Decisions (locked with user)

1. **One cargo + N comisiones** per member per gestión. A member holds at most one CEL or JDL cargo per term, plus any number of comisión memberships.
2. **Gestión = calendar year, implicit.** Assignments store `term: 2026`. No gestión collection; current gestión = current year.
3. **Invitation email = Firebase built-in.** After provisioning, backstage calls `sendPasswordResetEmail()`. No SMTP infra. Template/Spanish customization is a console owner op.
4. **Cargos and permission claims stay separate concepts.** Cargo = org chart (Spanish, gendered). Claim `Role` = permission engine (English, CASL). Each catalog position declares which claim roles it grants; a beacon trigger keeps claims in sync.

## Data model

### New collection: `positions`

```ts
type PositionCategory = 'CEL' | 'JDL' | 'Comision'

interface Position {
  id: string
  title: string            // 'Presidente'
  titleFemale: string      // 'Presidenta'
  category: PositionCategory
  grants: Role[]           // claim roles this position confers (may be empty)
  term: number | null      // JDL: e.g. 2026; CEL & Comision: null (evergreen)
  description: string      // Spanish, shown in permissions panel
  active: boolean
  deletedAt: Timestamp | null
}
```

- **CEL** — seeded fixed catalog (8): Presidente, Vicepresidente Ejecutivo, Vicepresidente de Área, Secretario, Tesorero, Asesor Legal, Pasado Presidente, Asesor Presidencial. All carry both gender variants (e.g. Secretaria/Secretario, Asesora Legal/Asesor Legal) so the model stays uniform.
- **JDL** — direcciones created in the UI per term (e.g. "Director de Miembro Individual", term 2026).
- **Comision** — created in the UI any time, evergreen (e.g. "Comité de Conducta y Ética"). Plain comisiones default to `grants: []` (chips only, no power).

Display rule: `member.gender === 'Femenino' ? titleFemale : title`.

Default grants mapping (editable per position in UI):

| Position | grants |
|---|---|
| Presidente | `Admin` |
| Vicepresidente Ejecutivo / de Área | `ExecutiveCommittee`, `Membership` |
| Tesorero | `Treasury` |
| Secretario | `Membership` |
| Asesor Legal / Pasado Presidente / Asesor Presidencial | `ExecutiveCommittee` |
| Director de Miembro Individual (JDL example) | `Membership` |
| Comisiones | none |

Every provisioned member always keeps the `Member` claim.

### Member additions

```ts
gender: 'Masculino' | 'Femenino'
positions?: {
  [term: string]: {            // '2026'
    cargoId: string | null     // one CEL or JDL position id
    comisionIds: string[]      // any number of Comision position ids
  }
}
```

- One read renders chips and full per-term history; no joins.
- Legacy `role` string stays during K2/K3 (forms stop writing it); dropped in K4 with a backfill of `positions` from it where feasible.
- "Who held cargo X in 2024" = client-side filter over members — acceptable at JCI scale (tens of members).

## Permissions chain

1. Admin assigns cargo/comisiones in UI → write to member doc `positions`.
2. firestore.rules: `positions` (and `gender`) editable by Admin/Membership/ExecutiveCommittee; existing invariants (uid, totalPoints immutable; soft-delete safe) unchanged.
3. Beacon trigger `onDocumentWritten('members/{id}')`: if `positions` or `uid` changed and member has `uid`, recompute custom claims = `['Member', ...union of grants from current-term positions]`. Idempotent; no-ops when claims already match.
4. CASL abilities pick up new claims on next token refresh (existing mechanism).

Consequences that fall out for free:
- Presidente/VPs (holding `ExecutiveCommittee`/`Admin`) can create JDL positions and assign directores.
- Director de Miembro Individual (granted `Membership`) can add normal members via existing rules — zero new rule logic.

## Invitation flow (K3)

`provisionMemberLogin` callable stays the engine (creates Auth user, sets claims, links uid). Change in backstage drawer:

1. Provision succeeds → backstage calls `sendPasswordResetEmail(auth, email)` from the client SDK.
2. Firebase sends the built-in (Spanish-customizable) email with the set-password link.
3. Drawer shows sent confirmation and keeps the copy-link fallback (from the callable's `actionLink`).

Owner ops follow-up: customize the password-reset email template (Spanish, JCI wording) in Firebase console.

## UI

### K1 — Sheet sizes (packages/ui)

`Sheet` gains `size?: 'sm' | 'md' | 'lg' | 'xl'` → max-widths 440 (default, current) / 560 / 680 / 800 px. Default preserves all existing consumers unchanged.

### K2 — Forms + catalog management (backstage)

- Invite/edit member forms: gender `Select`, cargo `Combobox` (gender-aware labels, filtered to current term: CEL + current-term JDL), comisiones `MultiSelect` with chips.
- Chips colored by category (CEL / JDL / Comision) in table and drawer.
- New settings page "Cargos y comisiones": list/create/deactivate JDL direcciones (per term) and comisiones; edit grants and descriptions. Guarded by `Admin`/`ExecutiveCommittee`.

### K4 — Member edit page + permissions panel (backstage)

- Dedicated route `/members/$memberId`: full profile editing, position history per gestión, permissions panel.
- Permissions panel lists effective abilities with Spanish descriptions, derived from CASL ability definitions + position `description` — no second permissions system.
- Drawer remains for quick view/edit from the table.
- `frontend-design` then `ui-ux-pro-max` skills run during this slice's design step.

## Slices / PRs

| Slice | Content | Risk surface |
|---|---|---|
| K1 | Sheet `size` prop | none |
| K2 | `Position` type + collection + rules, member `gender`/`positions`, forms, catalog page, CEL seed | firestore.rules → `/security-review` + firestore-security-reviewer |
| K3 | `sendPasswordResetEmail` in invite drawer, sent-state UI | auth flow → `/security-review` |
| K4 | claims-sync beacon trigger, member edit page, permissions panel, drop legacy `role` | functions + rules → `/security-review` + firebase-functions-reviewer + firestore-security-reviewer |

Order: K1 → K2 → K3 → K4. Each slice its own branch + PR (Conventional Commits, module scope).

## Testing

- **K1:** visual check; existing consumers compile unchanged (typecheck).
- **K2:** unit tests for member-mapper (gender variant picking, term resolution, chips derivation); rules tests for `positions` edit permissions (emulator).
- **K3:** emulator manual verify — Auth emulator surfaces the reset email link in logs.
- **K4:** emulator tests for claims-recompute trigger (assign cargo → claims updated; remove → revoked; idempotent re-run); rules tests for legacy `role` removal.

## Out of scope

- Branded HTML email (Trigger Email extension) — possible later upgrade, decision recorded above.
- Gestión metadata entity (themes, non-calendar terms).
- Spotlight (public site) display of the board — separate feature.
