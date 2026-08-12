# Data Models

All Firestore collections. Used by Backstage frontend and Beacon functions.

## positions/{positionId}

```typescript
interface Position {
  id: string                     // auto-generated Firestore ID
  title: string                  // display name (masculine / neutral form)
  titleFemale?: string | null    // explicit feminine override; derived by femaleTitle() when absent
  sigla?: string | null          // comisión acronym; unused for CEL/JDL
  category: 'CEL' | 'JDL' | 'Comision'
  grants: Role[]                 // permission roles this cargo confers (synced to claims by beacon)
  term: number | null            // calendar year (JDL only); null for CEL + Comision
  description: string
  active: boolean                // default: true — false = soft deleted
  deletedAt: Timestamp | null    // null = active, Timestamp = soft deleted
}
```

**Category semantics**:
- `CEL` — Executive Committee (fixed seed of 8 positions); Admin-only bootstrap via catalog page button; `writeBatch` atomic; refuses to seed a non-empty catalog.
- `JDL` — Board direcciones created per term (`term = <year>`); one set per gestión.
- `Comision` — Evergreen ad-hoc commissions (`term = null`); created on demand.

**`grants`**: the permission `Role[]` this position confers. Only Admin may write a non-empty `grants` array — enforced by Firestore rules to prevent Executive Committee self-escalation. **Comisiones are chips-only**: `category: 'Comision'` requires `grants: []` for every writer (position-schema client-side, `comisionGrantsEmpty()` in rules server-side), and the beacon claims-sync honors **cargo grants only** — `comisionIds` never confers claims. Power grants are honored only when the assignment's `assignedBy` is a live Admin.

**Soft delete**: `active: false` + `deletedAt: serverTimestamp()`. `getAll()` returns soft-deleted documents too (needed for historical assignment resolution — the UI filters `active === true` where applicable).

**Queries used**:
- Active positions: `where('active', '==', true)`
- All (including deleted, for history): no filter

> **Spec:** `docs/specs/2026-06-10-member-roles-invitations-design.md`

---

## members/{memberId}

```typescript
interface Member {
  id: string                  // auto-generated Firestore ID
  name: string                // min 3 chars
  email: string               // valid email
  phone?: string              // optional
  gender?: 'Masculino' | 'Femenino'  // used to pick Position.titleFemale for display
  profession?: string         // optional
  joinDate: Timestamp         // membership start date (required)
  birthdate: Timestamp        // required
  status: 'Activo' | 'Inactivo' | 'Desafiliado'  // membership standing (default 'Activo')
  profilePicture: string | null  // Firebase Storage URL or null (uploaded via admin drawer or self on /me)
  publicProfile?: boolean     // appear on the public Directiva (boardShowcase). Opt-OUT: beacon's
                              // onMemberCreated stamps true at create (clients may not set it —
                              // firestore.rules rejects the key on create). Only the member's own
                              // /me lane may change it; an Admin may additionally force it to false
                              // (takedown-only arm). Absent on pre-2026-08 docs = not published.
                              // Publication also requires a uid, a pinned own-bucket photo, a
                              // current-term CEL/JDL cargo, and status != 'Desafiliado'.
  totalPoints: number         // default: 0 — mirrors MemberPoints.cumulative (engine-written)
  isPastPresident?: boolean   // eligibility flag (no Mejor Miembro accrual); missing = false
  uid?: string                // linked Firebase Auth uid — set by provisionMemberLogin (admin SDK); absent until invited; immutable once set
  roleIds?: string[]          // custom role ids assigned directly (Admin-only)
  permissionOverrides?: PermissionOverrides // per-member coarse perm grants/revocations
  positions?: {               // one cargo + N comisiones per term; key = calendar year string
    [term: string]: {
      cargoId: string | null    // single CEL/JDL assignment for the term (null = none)
      comisionIds: string[]     // any number of Comision assignments
      assignedBy?: string       // uid of whoever wrote this term's assignment (K4+)
    }
  }
  active: boolean             // default: true — false = soft deleted
  deletedAt: Timestamp | null // null = active, Timestamp = soft deleted
}
```

**`status` vs `active`**: orthogonal. `active`/`deletedAt` are the system soft-delete
flag (a deleted row is hidden from the list). `status` is editable membership
standing — a `Desafiliado` member is **not** deleted and still appears in the list.

**`positions` map**: dot-path field updates (`positions.2026.cargoId`) preserve history across terms. The term key is the calendar year string (e.g. `"2026"`).

**`assignedBy`**: the uid of whoever wrote the term's assignment. The beacon `onMemberWritten` trigger uses it as a trust gate: the **cargo's** power grants (`Position.grants` non-empty) are included in the recomputed `roles` custom claim only when `assignedBy` is an Admin (`comisionIds` never confers claims — comisiones are chips-only). Absent on pre-K4 docs → treated as untrusted (power grants dropped; member receives only `['Member']`). Because the field is shared per term and rules force it to the writer, non-Admin positions writes are denied outright while a power cargo is assigned — a permitted edit can never silently restamp away Admin-granted power.

**Custom claims (`roles` + `perms`)**: recomputed by the beacon `onMemberWritten` trigger (`onDocumentWritten('members/{id}')`) on every member write. The `roles` claim is `['Member', ...trusted current-term grants]` in canonical `ROLES` order; the `perms` claim holds the coarse `action:Subject` permissions resolved from role definitions (`roles` collection) + `permissionOverrides` (cap 30, fail-closed). An existing `Scanner` role (set by `setUserRoles`) is preserved; event scoping was removed, so a Scanner's authority is the coarse `checkIn:Attendance` perm plus the Attendee-only conjunct in `firestore.rules`. Only applies to provisioned members (`uid` present). The `onRoleWritten` trigger re-syncs claims when a role definition changes.

**Soft delete**: Never hard-delete members. Set `active: false` and `deletedAt: serverTimestamp()`.

> **Type location:** `Member` type + `MemberInput` Zod schema live in `@luminova/types`. Form input handles `joinDate`/`birthdate` as `YYYY-MM-DD` strings; the repository maps them to/from Firestore `Timestamp`.
>
> **Spec:** `docs/specs/2026-06-10-member-roles-invitations-design.md`

**Queries used**:
- Get active members: `where('active', '==', true)`
- Paginated: `orderBy('name'), limit(10), startAfter(cursor)`

---

## events/{eventId} — LEGACY

The v2 `Event` model (`type`/`scope`/`director` + role arrays) was superseded by the
Recognition Engine's `programs` / `projects` / `activities` collections (below). Nothing
reads or writes it, and its `firestore.rules` block was removed in `38e9010` — `/events`
now falls through to the deny-all `match /{document=**}` catch-all, asserted by a rules
test. Kept here only so the name resolves for anyone reading old specs.

---

## pointRules/{pointRuleId}

Superseded model note: the original `type × role` rule matrix was replaced by the
engine's fixed 18-code `PointRuleCode` matrix — see **pointRules** under the
Recognition Engine section below.

---

## allies/{allyId}

```typescript
interface Ally {
  id: string
  companyName: string         // required, min 3 chars
  contactPerson: string       // required, min 3 chars (label "Encargado")
  phone: string               // required
  email: string               // valid email
  logoUrl: string | null      // Firebase Storage URL (backstage upload) or null
  category: AllyCategory | null // public chip; feeds the allyShowcase projection
  active: boolean             // system — soft-delete flag (default true)
  deletedAt: Timestamp | null // system — set on soft-delete (serverTimestamp)
}
```

**Soft-delete**: allies are never hard-deleted. `softDelete` sets `active=false` and
`deletedAt`. List/read queries filter `active==true`. `active`/`deletedAt` are
system-managed — never written by the edit form.

**Query used**: `where('active','==',true)`, sorted client-side by `companyName` (es locale).

The beacon `onAllyWritten` trigger projects public fields (name + logo + category) into
the world-readable `allyShowcase` collection for the spotlight allies wall;
`contactPerson`/`phone`/`email` never leave `/allies`.

---

## memberPoints/{memberId__termId}

**Write-protected**: only Cloud Functions (beacon) write here; clients read-only. The
old `memberPoints/{year}/{month}/{eventId}` event-keyed layout is gone — the aggregate
is per member per term. See **memberPoints** under the Recognition Engine section below
for the current shape.

---

## Firestore Security Rules Summary

Since the dynamic-permissions epic (N1), most gates are **permission-based**
(`canDo('<action>', '<Subject>')` against the `perms` custom claim) rather than
hard-coded role checks. `firestore.rules` is the source of truth; summary:

| Collection | Read | Create / Update | Delete |
|---|---|---|---|
| `members` | perm `read:Member`, or self (own `uid`) | perm-gated (`create/update:Member`); self (profilePicture only) | never (soft-delete only) |
| `positions` | signed-in | perm-gated; non-empty `grants` = Admin-only | never (soft-delete only) |
| `roles` | signed-in | Admin. **Create:** custom roles only (`builtIn:false`, `builtInKey:null`), and must author `active:true` + `deletedAt:null`. **Update:** any non-`locked` role incl. built-ins (name/description/permissions); deactivation and reactivation both allowed except on `locked` (Admin) and `builtInKey=='Member'` | never (soft-delete only) |
| `allies` | perm `read:Ally` | perm-gated | never (soft-delete only) |
| `pointRules` | signed-in | perm-gated (`PointRule`) | never |
| `terms` | signed-in | Admin | never |
| `programs` / `projects` | signed-in | perm-gated initiative rules (+ direction constraints) | never |
| `activities` | signed-in | perm-gated, or parent-initiative direction (`directionUids`) | never |
| `checkIns` | signed-in | `checkIn:Attendance` holders; a Scanner among them is confined to `Attendee` rows unless it also holds `manage:Attendance`; bound to the activity's check-in window | same authority as create (undo); update never |
| `participations` | signed-in | engine only (`if false`) | never |
| `memberPoints` | signed-in | engine only (`if false`) | never |
| `showcase` / `allyShowcase` | public | engine only (`if false`) | never |
| `siteConfig/current` | public | Admin | Admin (`write`) |
| `board` | public | Admin | never |
| `*` | deny | deny | deny |

> **members write rules (two tiers):**
> 1. Permission holders (`update:Member`) — full update (excluding `totalPoints` and `uid`, which are immutable from client writes).
> 2. Self — may update only `profilePicture` (own doc via matching `uid`).
>
> The ExecutiveCommittee positions-only lane was removed with `manage:Position`: cargo
> assignment is now Admin + `manage:Member` only.
>
> **Positions-update constraints (all tiers):** any write touching `positions` must satisfy `positionsAssignmentSafe()`:
> - Only the **current term key** (`string(request.time.year())`) may change — past terms are read-only for all client writes (admin-SDK/console for historical corrections).
> - `positions.<currentTerm>.assignedBy` must equal `request.auth.uid` (writer stamps themselves).
> - Non-Admin writers may only assign a cargo whose `grants` array is empty (no power conferral) **and** may only displace a cargo whose `grants` array is empty (`currentCargoGrantsEmpty()`) — otherwise a `manage:Member` holder could overwrite a president's cargo with a grant-free one and strip the Admin claim. Admin is unrestricted.
> - These constraints close the "ride-along" attack where a non-Admin sneaks a power cargo under a different term key in the same write.
> - Comisión `grants` are not loop-checkable in rules — instead the invariant is structural: comisiones can never hold grants (`comisionGrantsEmpty()` on positions writes) and claims-sync ignores `comisionIds` for grants entirely.
>
> **positions write rule:** position writes are `manage:Position` holders only (Admin, or a custom role granted it). Admin may write any field including `grants`, except that a `Comision`-category position must keep `grants: []` (all tiers, structural invariant).
>
> **built-in roles:** nine keys — `Admin`, `Membership`, `Treasury`, `ExecutiveCommittee`,
> `ProjectManager`, `ActivityManager`, `Secretary`, `Scanner`, `Member` — with their coarse
> perms in `packages/types/src/role-definition.ts` (`BUILT_IN_ROLE_PERMS`), mirrored for the
> plain-Node seed scripts in `tools/scripts/lib/role-seed.mjs`. `seedRoles` only ever
> CREATES; to move an existing production doc onto a new snapshot run the
> `reseedBuiltInRolePerms` callable (see `apps/beacon/CLAUDE.md`). A role key added here
> needs `seedRoles` FIRST (it creates the doc) and the reseed SECOND (it only updates) —
> run in the other order and the new role stays permanently unsynced.
>
> **Deploy ordering for the nine-role rollout.** Rules and functions deploy separately; one
> PR is not one atomic deploy.
> 1. Deploy **functions** — `reseedBuiltInRolePerms` and the claims-sync changes.
> 2. Run `seedRoles` (creates the two new role docs), then `reseedBuiltInRolePerms` with
>    `dryRun: true`, review the preview, then run it with `confirm: "overwrite-builtin-roles"`.
> 3. Run `recomputeAllClaims` — the observable backstop for members stranded by an
>    `onRoleWritten` timeout.
> 4. In `/positions`, **ADD `Secretary` to the Secretario cargo's `grants`**, then
>    **remove `Admin`** from it — in that order. The `cel-positions.ts` / `cel-seed.mjs`
>    mapping only reaches a fresh project (`seedPresident` writes `CEL_SEED` just
>    `if (snap.empty)`), so in an existing chapter this is an Admin-typed `/positions` edit.
>    Step 2 takes the Ally trio off `Membership`; adding `Secretary` second — or not at all —
>    leaves `create:Ally`/`update:Ally` and `manage:Lead`/`manage:Notification` Admin-only
>    and drops `/allies` and `/leads` out of the CEL's nav.
> 5. Deploy **rules** last.
>
> Rules-before-reseed leaves a window where the CEL positions lane is gone while CEL role
> docs still carry `manage:Position`: the positions form renders for CEL users whose writes
> are already denied — render-then-die. Hosting deploys after the reseed for the same
> reason (a Scanner's UI check-in affordances read the reseeded `perms` claim).
>
> **roles display text:** a role doc's `name` and `description` are the **single source of truth** for what every UI surface renders — the cargo table, the cargo grants picker, the member permissions panel and `/permisos` all resolve through `roleDisplay()` (`apps/backstage/src/lib/role-display.ts`). `ROLE_LABELS` / `ROLE_DESCRIPTIONS` in `@luminova/types` are a **seed snapshot only**, read as a bootstrap fallback when no doc exists for a built-in key (fresh project, pre-seed); both seeders (`apps/beacon/src/seed-roles.ts`, `tools/scripts/lib/role-seed.mjs`) write them at create time and never clobber an admin's later rename. Two eslint rules in the root `eslint.config.js` (`no-restricted-imports` on the snapshot constants + `no-restricted-syntax` on a role-keyed label map) fail `pnpm lint` if another backstage module declares a second role table; `docs/reuse-first-ui.md` lists the shapes they do and do not catch.
>
> **roles lifecycle (deactivate / reactivate).** A role doc is soft-deleted (`active:false` +
> `deletedAt`) and can be brought back — the one collection in this repo where `active` moves
> in BOTH directions. `roles` therefore uses `roleLifecycleSafe()` instead of the shared
> one-way `softDeleteSafe()`; every other collection keeps the one-way semantics, so do not
> "unify" them. Two roles can never be deactivated: `Admin` (`locked`, anti-lockout) and
> `Member`, which `computeMemberRoles` injects into every claim unconditionally — deactivating
> it would collapse nav and route access chapter-wide. To strip authority from `Member`, empty
> its `permissions`.
>
> What "inactive" means to the perms pipeline is three-way, and the distinction is
> load-bearing: a built-in key whose doc is **absent** falls back to the `BUILT_IN_ROLE_PERMS`
> snapshot (the pre-seed window on a fresh project), while a doc that is **present but
> inactive** covers its key and contributes **nothing**. Conflating the two is what previously
> made deactivation unsafe — it silently restored seed perms. "Inactive" is `isActiveRoleDoc`
> (`active !== false` AND `deletedAt` null-ish), not the `active` field alone.
>
> A deactivated role keeps its stored `permissions`, still editable, and reactivating mints
> them to every holder at once — `/permisos` labels the row accordingly rather than reporting
> zero. Deactivation revokes **perms only, never name-keyed authority**: the `roles` custom
> claim is pure over `positions.grants`, so gates like `canCurateFeatured()`
> (`hasAnyRole(['Admin','ProjectManager'])`) survive it. Removing those means editing the
> cargo's `grants`. Deploy order is beacon → rules → hosting.

---

## TypeScript Shared Types

All shared types + their Zod schemas live in the **`@luminova/types`** built package,
one module per entity in `packages/types/src/` (`member.ts`, `ally.ts`, `position.ts`,
`role-definition.ts`, `site-config.ts`, `permission.ts`, …). There is no `models.ts`
barrel; import from `@luminova/types`.

The Recognition Engine entities below (F3) live in `@luminova/types/engine`
(`packages/types/src/engine/`) — a pure, framework-free subpath that is safe for
beacon (admin SDK) as well as the frontends.

---

## Recognition Engine (F3)

The participation → points → recognition spine behind the *Mejor Miembro
Individual* monthly competition (`docs/reference/points-matrix.md`). Types ship in
`@luminova/types`; pure types + helpers re-export from `@luminova/types/engine`
(framework-free for beacon `awardPoints` in A2). **Design doc:**
`docs/superpowers/specs/2026-06-06-recognition-engine-model-design.md`.

### terms/{termId}

```typescript
interface Term {
  id: string                     // the doc id IS the year, e.g. "2026"
  label?: string                // e.g. "Gestión 2026"
  board: BoardSeat[]             // CEL + JDL roster
  conventionDate: Timestamp | null // unknown at term start (set later)
  pointsCutoffAt: Timestamp | null // = conventionDate − 3 weeks; unknown at term start
  bestMemberId: string | null    // winner, set at term close → next term's exclusion
  status: 'Activo' | 'Cerrado'
}
```

> **A1 update:** the `Term` doc id is the year (`terms/2026`); the `year` field was
> dropped as redundant, and the two convention dates are nullable (unknown when a
> term opens). `terms` rules are now live (read: signed-in; create/update: Admin;
> delete: denied); `pointRules` create/update are perm-gated (`canDo(…, 'PointRule')`,
delete denied). The Point Rules admin seeds a
> current-year term + the 16 rules from `DEFAULT_POINT_VALUES` / `POINT_RULE_LABELS`.

```typescript
interface BoardSeat {
  memberId: string
  title: string                  // chapter title (Spanish) — NOT a permission role
  isExecutiveCommittee: boolean   // CEL flag → eligibility
}
```

### programs/{programId} · projects/{projectId}

Distinct collections (different at their core + distinct point codes). Both are the
shared `InitiativeCore` shape verbatim (C1-lite); the award-dossier fields
(phases/budget/SDG/readiness) remain **C1-dossier**, still pending.

```typescript
interface InitiativeCore {          // Program and Project are this shape verbatim
  id; termId; title; description
  category: AreaOfOpportunity       // Desarrollo Individual/Comunitario, Negocios, Cooperación
  startDate: Timestamp; endDate: Timestamp
  roster: InitiativeRoster
  photos: Photo[]                   // gallery metadata; binaries in Storage
  impact: InitiativeImpact | null   // completion-wizard capture; null until Finalizado
  finalReport: FinalReport | null   // null until filed → gate B
  status: InitiativeStatus
  directionUids: string[]           // engine-mirrored direction uids (rules direction branch)
  featured: boolean                 // curated showcase flag
}
interface InitiativeRoster { directorId: string; coDirectorIds: string[]; teamIds: string[] }
interface FinalReport { filedAt: Timestamp; filedBy: string }
type InitiativeStatus = 'Planificacion' | 'EnEjecucion' | 'Finalizado'
```

> **Initiative lock:** once `finalReport` is filed (the initiative is Finalizado /
> closed), `firestore.rules` `initiativeWriteSafe()` pins `finalReport`, `status`,
> `impact`, `roster`, `startDate` and `endDate`. The `roster` (direction + team) is
> locked because it drives the confirmed participation rows, which only re-derive at
> the null→set `finalReport` transition — a post-close roster edit would silently
> change the implied point recipients. `startDate`/`endDate` are frozen as the
> historical record of a completed initiative. The backstage initiative-form
> disables those fields when finalized; keep the two sets in lockstep.

### activities/{activityId}

The **unified attendable unit**. Institutional categories have `parentId === null`;
`ProjectExecution` ties to a parent Program/Project.

```typescript
interface Activity {
  id: string
  termId: string
  title: string
  description: string | null
  location: string | null         // free-text venue: physical address or virtual link
  category: 'Assembly' | 'Course' | 'Anniversary' | 'TM' | 'NationalEvent' | 'ProjectExecution'
  parentType: 'Program' | 'Project' | null
  parentId: string | null         // null ⟺ institutional
  organizers: { directorId: string | null; coDirectorIds: string[] }
  startAt: Timestamp              // punctuality reference for check-in
  endAt: Timestamp | null
  photos: Photo[]
  status: 'Programada' | 'Ejecutada' | 'Cancelada'
  hasCheckIns?: boolean           // beacon-only mirror (awardPoints); rules lock below
}
```

> **Invariant A:** `category === 'ProjectExecution'` ⟺ `parentId !== null`. Enforced
> in `activitySchema.superRefine`.

> **Activity lock:** once any check-in references the activity, beacon's `awardPoints`
> mirrors `hasCheckIns: true` onto the doc (count-recomputed in a transaction whose
> flag write is deliberately **unconditional** — it is the write-write conflict anchor
> that serializes racing syncs) and `firestore.rules` locks `category`/`startAt`/
> `parentId`/`parentType`/`termId` for every client writer — these feed the points
> derivation. Clients can never write `hasCheckIns` itself. The client repository
> keeps its live-count guard for the trigger-latency window.

### pointRules/{pointRuleId}

Fixed `PointRuleCode` enum (16 matrix rows); admin edits only `points` (A1).
`DEFAULT_POINT_VALUES` holds the matrix baseline.

```typescript
interface PointRule { id; termId; code: PointRuleCode; points: number; label: string }
type PointRuleCode =
  | 'DirectProgram' | 'CoDirectProgram' | 'DirectProject' | 'CoDirectProject'
  | 'DirectActivity' | 'CoDirectActivity' | 'ProgramProjectTeam'
  | 'AttendAssembly' | 'AttendCourse' | 'AttendActivity' | 'AttendNationalEvent'
  | 'AttendAnniversary' | 'AttendTM' | 'HeadTrainer' | 'AssistantTrainer'
  | 'PaymentPlanAdhesion'
```

### checkIns/{checkInId} — engine input (A2)

The client-written fact that drives `awardPoints`. The engine derives the
`participations` row from it (clients never write `participations` directly).

```typescript
interface CheckIn {
  memberId: string
  activityId: string
  role: 'Director' | 'CoDirector' | 'Team' | 'Attendee'
  checkInAt: Timestamp
}
```

Rules: read = signed-in; create = `checkIn:Attendance` permission holders
(Admin/ProjectManager/ActivityManager or a custom role); a Scanner is confined to
`Attendee` rows (`manage:Attendance` is the escape hatch) — event scoping was removed;
non-Admin creators are bound to the activity's
check-in day (same Bolivia-local day — Admin may backdate), and for everyone the
activity must not be Cancelada nor its parent Finalizado. **No update** — but **delete is allowed** with the same authority +
window binding (undo a mis-scan; the beacon reconciles points on delete). A role
correction is a new check-in that overwrites the deterministic
`participations/{activityId__memberId__role}` row. `awardPoints` (beacon,
`onDocumentWritten('checkIns/{id}')`) reads the activity + `pointRules/{termId__code}`,
derives the row, and transactionally recomputes `memberPoints/{memberId__termId}` +
mirrors `members.totalPoints`. The `onProgramWritten`/`onProjectWritten` triggers
reconcile roster rows and flip a parented initiative's rows confirmed when its
`finalReport` is filed.

### participations/{participationId} — ledger (engine-written, client read-only)

```typescript
interface Participation {
  id; memberId; termId; activityId
  parentType: 'Program' | 'Project' | null  // denormalized from the activity (report-gate query)
  parentId: string | null
  role: 'Director' | 'CoDirector' | 'Team' | 'Attendee'
  pointRuleCode: PointRuleCode
  basePoints: number             // snapshot of PointRule.points at award time
  punctualityFactor: 1 | 0.5     // 1.0 for non-Attendee roles
  computedPoints: number         // basePoints * punctualityFactor
  monthBucket: string            // 'YYYY-MM'
  state: 'provisional' | 'confirmed' | 'voided'
  gates: { attendanceRegistered: boolean; finalReportFiled: boolean }
  checkInAt: Timestamp | null
  voidReason: string | null      // e.g. 'DuesUnpaid:2026-06'
  createdAt: Timestamp
}
```

### memberPoints/{memberId__termId} — derived aggregate (engine-written)

```typescript
interface MemberPoints {
  id: string                     // === `${memberId}__${termId}` (per-term; the competition resets each gestión)
  memberId: string
  termId: string
  cumulative: number             // Σ computedPoints of confirmed rows in term window
  byMonth: Record<string, number> // { 'YYYY-MM': number }
  updatedAt: Timestamp
}
```

The engine writes `memberPoints/{memberId__termId}`. The `participations` confirmed
query (`memberId == · termId == · state == confirmed`) needs a composite index
(in `firestore.indexes.json`).

`Member.totalPoints` mirrors `cumulative`. **Never authored directly.** A new optional
`Member.isPastPresident?: boolean` (missing = `false`) feeds eligibility.

### Derivation rules (documented; A2 enforces at runtime)

1. **Every participation attaches to an Activity.** `pointRuleCode` resolved by
   `resolvePointRuleCode({ role, parentType, category })`. Direction/team rows emit
   **per activity** under the program/project.
2. **Punctuality factor** (`computePunctualityFactor`) applies **only to `Attendee`**:
   `checkInAt ≤ startAt + 15min → 1.0`, later or missing → `0.5`. Other roles flat `1.0`.
3. **Gates → state:** `attendanceRegistered` always required; `finalReportFiled`
   required **only when the activity has a parent**. `confirmed` ⟺ all applicable
   gates true, else `provisional`. `voided` overrides.
4. **Finance → Points (read-only coupling):** engine reads `duesStatus` (Finance/J,
   not modelled here). A month not *al día* ⇒ that month's rows → `voided` (restored
   on payment); a payment plan emits a `PaymentPlanAdhesion` (+5) row.
5. **`MemberPoints.cumulative` = Σ `computedPoints` of `confirmed` rows** within the
   term window (≤ `Term.pointsCutoffAt`).
6. **Eligibility** (`evaluateEligibility`): `isExecutiveCommittee` derived from
   `Term.board`, `wonBestMemberPreviousTerm` from `prevTerm.bestMemberId`,
   `isPastPresident` stored on Member. Past-presidents don't accrue; CEL + last
   winner accrue but are excluded from the leaderboard (A6).

### firestore.rules

All engine rules are live in `firestore.rules` — see the **Firestore Security Rules
Summary** table above for the current read/write matrix (`terms`, `pointRules`,
`programs`/`projects`, `activities`, `checkIns`, `participations`, `memberPoints`).
