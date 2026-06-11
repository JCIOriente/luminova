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
- Legacy `role` string stays during K2/K3 (forms stop writing it); dropped outright in K4 — no migration (see K4 Addendum, decision 3).
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

---

# K4 Addendum — Claims sync, edit page, permissions (2026-06-11)

**Status:** Approved (brainstorm round-trip locked the four decisions below).
**Supersedes** the thin K4 rows in the tables above where they conflict.

## K4 decisions (locked with user)

1. **Trust gate = signed `assignedBy` + trigger re-check (defense in depth).** Firestore triggers carry no actor identity, so escalation is gated on two independent layers — rules at write time, the trigger at claim-compute time.
2. **History: current term editable, past terms read-only.** Matches the K2 mapper's dot-path write (`positions.<currentTerm>`). No term picker; past gestiones render as a read-only timeline.
3. **Drop `Member.role` outright — no migration.** Still in development; the dev DB is reseeded rather than migrated. The freeform legacy string is unmappable to catalog ids, so nothing is backfilled. Seed data improves to carry `gender` + `positions`.
4. **Claim authority: positions own org roles; preserve Scanner.** The trigger sets `roles = ['Member', ...trustedGrants]` and additionally re-adds `Scanner` (+ `scannerEventIds`) when previously present. All org roles (Admin/Membership/Treasury/ExecutiveCommittee/ProjectManager) flow only from positions; `Scanner` stays event-scoped via `setUserRoles`.

## Data model change

`TermPositions` gains an audit field:

```ts
interface TermPositions {
  cargoId: string | null
  comisionIds: string[]
  assignedBy?: string   // uid of the writer of THIS term's assignment
}
```

- Optional on read: pre-K4 (K2) docs lack it → the trigger treats a missing `assignedBy` as **untrusted** (drops power-conferring grants). Safe default.
- The member mapper stamps `assignedBy = <current uid>` into the current-term object on every positions write.
- `Member.role` is removed from the type, the Zod schema, the mapper, the table/filter/display, and seed data.

## Beacon trigger — `onMemberWritten`

`onDocumentWritten('members/{id}')` in `apps/beacon` (exported from `index.ts`; esbuild already bundles `@luminova/*`).

Algorithm:

1. If `after` missing (delete) or `after.uid` absent (not provisioned → no Auth user) → no-op.
2. Resolve current term (`currentTermKey()`); read `after.positions[term]` → `cargoId` + `comisionIds`.
3. Load referenced positions from the `positions` collection (admin SDK). Union their `grants`.
4. **Trust gate:** for any assigned position whose `grants` is non-empty, resolve the assignment's `assignedBy` via `auth.getUser(assignedBy)`; honor those grants only if that uid's claims include `Admin`. Missing / non-Admin `assignedBy` → drop that position's grants. Empty-grant comisiones are always honored (confer nothing).
5. Read existing custom claims; compute `roles = unique(['Member', ...trustedGrants, ...(existing Scanner ? ['Scanner'] : [])])`; preserve `scannerEventIds`.
6. If computed claims deep-equal existing → no-op (idempotent, avoids churn and re-fires). Else `setCustomUserClaims(uid, next)`.

- **No write back to the member doc** → the trigger cannot retrigger itself (no loop).
- A pure helper `computeMemberRoles({ grants, hadScanner, existingRoles })` holds the set logic and is unit-tested without the SDK; the SDK-bound trust lookup is tested via the emulator.
- **Required e2e (emulator):** *Membership assigns Presidente cargo → trigger drops the Admin grant → claims stay `['Member']` (no Admin).*

## firestore.rules

On the `members` update paths that allow touching `positions` (Membership full-update and the K2 ExecutiveCommittee positions-only path):

- When `positions` is in `affectedKeys`, require the current-term object's `assignedBy == request.auth.uid` (no impersonation).
- Non-Admin callers may only assign a cargo whose catalog `grants` is empty: `get(/databases/$(database)/documents/positions/$(cargoId)).data.grants.size() == 0`. Assigning a power-conferring cargo is denied for non-Admin. The Admin path is unrestricted.

This makes the permissions panel's catalog-derived view **truthful** (only an Admin can have assigned a power cargo), so the trigger's `assignedBy` re-check is the redundant second layer rather than the sole guard.

## provisionMemberLogin alignment

No logic fight: it keeps bootstrapping `['Member']` (merged, preserving existing claims). Its `uid`-linkage write fires `onMemberWritten`, which immediately recomputes from positions — a pre-assigned Presidenta self-heals to her full claims on first provision. Same `['Member', ...]` base on both sides.

## UI — member edit page

`_app.members_.$memberId.tsx` grows from read-only profile to:

- **Edit form** — reuse `MemberForm`; edits current-term cargo + comisiones (+ personal fields). ExecutiveCommittee sees a positions-only variant (rule tier already live from K2); everything else read-only for them.
- **History timeline** — past terms, read-only, resolved gendered labels (`positionTitle` + positions map), newest first.
- **Permissions panel** — union of current-term grants → roles → `PERMISSION_ROLE_INFO` `{ label, description }` list (+ base *Miembro*). Client-pure derivation from CASL + labels; no second permissions system, no callable.
- `frontend-design` → `ui-ux-pro-max` run for this page's visual layer.

## Members table + filter

- Cargo cell → category-colored `Badge` chips (CEL `navy` / JDL `teal` / Comisión `gray`) via `memberPositionLabel` + positions map.
- Filter search matches `name + email + resolvedCargoLabel` (legacy `role` removed from the match string).

## Known limitation (documented)

An affected member's new claims surface on their next ID-token refresh / re-login. No proactive force-refresh — you cannot refresh another user's token anyway, and the assigner is a different user than the assignee. Recorded as accepted.

## K4 gates

- Emulator e2e for the trigger (the escalation test above + assign→claim, remove→revoke, idempotent re-run).
- `/security-review` + `firebase-functions-reviewer` + `firestore-security-reviewer` before the PR (functions + rules touched).
- Rules suite via `pnpm --filter @luminova/firestore-rules-tests run test:run`; `turbo run ci` minus emulator suites (running emulators race `pnpm pr-tests`).
