# Data Models

All Firestore collections. Used by Backstage frontend and Beacon functions.

## members/{memberId}

```typescript
interface Member {
  id: string                  // auto-generated Firestore ID
  name: string                // min 3 chars
  email: string               // valid email
  phone?: string              // optional
  role: string                // min 3 chars (e.g. "Presidente", "Secretario")
  profession?: string         // optional
  joinDate: Timestamp         // membership start date (required)
  birthdate: Timestamp        // required
  status: 'Activo' | 'Inactivo' | 'Desafiliado'  // membership standing (default 'Activo')
  profilePicture: string | null  // Firebase Storage URL or null (upload deferred — set null on create)
  totalPoints: number         // default: 0 — updated by aggregation
  active: boolean             // default: true — false = soft deleted
  deletedAt: Timestamp | null // null = active, Timestamp = soft deleted
}
```

**`status` vs `active`**: orthogonal. `active`/`deletedAt` are the system soft-delete
flag (a deleted row is hidden from the list). `status` is editable membership
standing — a `Desafiliado` member is **not** deleted and still appears in the list.

**Soft delete**: Never hard-delete members. Set `active: false` and `deletedAt: serverTimestamp()`.

> **Type location:** `@luminova/types` does not exist yet (no `beacon` consumer
> needs a shared `Member`). The `Member` type + `MemberInput` Zod schema live
> locally in `apps/backstage/src/features/members/types/`. Promote to
> `@luminova/types` when a second app (beacon) consumes it. Form input handles
> `joinDate`/`birthdate` as `YYYY-MM-DD` strings; the repository maps them to/from
> Firestore `Timestamp`.

**Queries used**:
- Get active members: `where('active', '==', true)`
- Paginated: `orderBy('name'), limit(10), startAfter(cursor)`

---

## events/{eventId}

```typescript
interface Event {
  id: string
  type: 'Program' | 'Project' | 'Activity' | 'Gala'
  name: string                // required
  description?: string
  scope: 'National' | 'Local' // default: 'Local'
  directorId: string          // member ID — required
  coDirectorIds: string[]     // member IDs
  collaboratorIds: string[]   // member IDs
  participantIds: string[]    // member IDs
  parentId?: string           // only for type='Activity' — references another event
  startDate: Timestamp
  endDate: Timestamp          // must be >= startDate
}
```

**Validation**: `endDate >= startDate` enforced at form level (Zod) and should be checked in functions.

---

## pointRules/{ruleId}

```typescript
interface PointRule {
  id: string
  type: 'Program' | 'Project' | 'Activity' | 'Gala'
  role: 'Director' | 'CoDirector' | 'Collaborator' | 'Participant'
  points: number              // non-negative integer
  description: string         // e.g. "Director de Programa Nacional"
}
```

**Query used in beacon**: `where('type', '==', event.type)` to get all rules for an event type.

**Matrix**: Each `type × role` combination can have one rule. 4 types × 4 roles = 16 possible rules.

---

## allies/{allyId}

```typescript
interface Ally {
  id: string
  companyName: string         // required, min 3 chars
  contactPerson: string       // required, min 3 chars (label "Encargado")
  phone: string               // required
  email: string               // valid email
  active: boolean             // system — soft-delete flag (default true)
  deletedAt: Timestamp | null // system — set on soft-delete (serverTimestamp)
}
```

**Soft-delete**: allies are never hard-deleted. `softDelete` sets `active=false` and
`deletedAt`. List/read queries filter `active==true`. `active`/`deletedAt` are
system-managed — never written by the edit form.

**Query used**: `where('active','==',true)`, sorted client-side by `companyName` (es locale).

---

## memberPoints/{year}/{month}/{eventId}

**Write-protected**: Only Cloud Functions (beacon) write to this collection. Client has read-only access.

```typescript
interface MemberPoints {
  director: string            // memberId
  name: string                // event name (denormalized for display)
  coDirectorIds: string[]
  collaboratorIds: string[]
  participantIds: string[]
  points: Record<string, number>  // memberId → total points for this event
  updatedAt: Timestamp        // serverTimestamp()
}
```

**Path structure**: `memberPoints/{year}/{month}/{eventId}`
- `year`: full year string e.g. `"2025"`
- `month`: zero-padded month e.g. `"01"` through `"12"`
- `eventId`: same as the event document ID

**Example path**: `memberPoints/2025/03/abc123def456`

---

## Firestore Security Rules Summary

```
members       → authenticated read/write
events        → authenticated read/write
pointRules    → authenticated read/write
allies        → authenticated read/write
memberPoints  → authenticated read only (no client writes)
*             → deny all
```

---

## TypeScript Shared Types

Located in `packages/types/src/models.ts`:

```typescript
export type EventType = 'Program' | 'Project' | 'Activity' | 'Gala'
export type EventRole = 'Director' | 'CoDirector' | 'Collaborator' | 'Participant'
export type EventScope = 'National' | 'Local'

export interface Member { ... }
export interface Event { ... }
export interface PointRule { ... }
export interface Ally { ... }
export interface MemberPoints { ... }
```

Zod input schemas live in each feature's `types/` folder in Backstage (not in the shared package).

> **Note:** the `members`/`allies` types + their zod schemas now live in the
> **`@luminova/types`** built package (F2). The Recognition Engine entities below
> (F3) live in `@luminova/types/engine` (a pure, beacon-safe subpath).

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
> delete: denied), as is `pointRules` write = Admin. The Point Rules admin seeds a
> current-year term + the 16 rules from `DEFAULT_POINT_VALUES` / `POINT_RULE_LABELS`.

```typescript
interface BoardSeat {
  memberId: string
  title: string                  // chapter title (Spanish) — NOT a permission role
  isExecutiveCommittee: boolean   // CEL flag → eligibility
}
```

### programs/{programId} · projects/{projectId}

Distinct collections (different at their core + distinct point codes). Engine-minimal
— the rich Project dossier (phases/budget/SDG/evidence/public projection) is **C1**.

```typescript
interface Program { id; termId; title; roster; finalReport; status }  // Program ≠ Project
interface Project { id; termId; title; roster; finalReport; status }
interface InitiativeRoster { directorId: string; coDirectorId: string | null; teamIds: string[] }
interface FinalReport { filedAt: Timestamp; filedBy: string }  // null until filed → gate B
type InitiativeStatus = 'Planificacion' | 'EnEjecucion' | 'Finalizado'
```

### activities/{activityId}

The **unified attendable unit**. Institutional categories have `parentId === null`;
`ProjectExecution` ties to a parent Program/Project.

```typescript
interface Activity {
  id: string
  termId: string
  category: 'Assembly' | 'Course' | 'Anniversary' | 'TM' | 'NationalEvent' | 'ProjectExecution'
  parentType: 'Program' | 'Project' | null
  parentId: string | null         // null ⟺ institutional
  organizers: { directorId: string | null; coDirectorId: string | null }
  startAt: Timestamp              // punctuality reference for check-in
  status: 'Programada' | 'Ejecutada' | 'Cancelada'
}
```

> **Invariant A:** `category === 'ProjectExecution'` ⟺ `parentId !== null`. Enforced
> in `activitySchema.superRefine`.

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

Rules: read = signed-in; create = Admin/ProjectManager, or Scanner when
`activityId ∈ token.scannerEventIds`; **immutable** (no update/delete — a
correction is a new check-in that overwrites the deterministic
`participations/{activityId__memberId__role}` row). `awardPoints` (beacon,
`onDocumentWritten('checkIns/{id}')`) reads the activity + `pointRules/{termId__code}`,
derives the row, and recomputes `memberPoints/{memberId}` + mirrors
`members.totalPoints`. Two more triggers (`confirmOnProgramReport`,
`confirmOnProjectReport`) flip a parented initiative's rows confirmed when its
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

### memberPoints/{memberId} — derived aggregate (engine-written)

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

### firestore.rules implications (documented — edits land with A1/A2/D1, NOT this PR)

| Collection | Client read | Client write |
|---|---|---|
| `terms` | signed-in | Admin only |
| `pointRules` | signed-in | Admin only |
| `programs` / `projects` | signed-in | ProjectManager/Admin |
| `activities` | signed-in | ProjectManager/Admin |
| `participations` | signed-in (points are transparent) | **`if false`** — engine only |
| `memberPoints` | signed-in (already public, F1) | **`if false`** — engine only |
