# F3 — Recognition Engine Data Model — Design

_Date: 2026-06-06 · Branch: `feat/recognition-engine-model` · Status: approved_

## Goal

Design the **Recognition Engine** data model — the entities, invariants, and
derivation rules under all of §A (Point Rules → `awardPoints` → profile → QR →
leaderboard) — and promote it into `@luminova/types` following the F2
promote-and-share pattern (BUILT package, emits `dist/`).

This is a **data-model design task**: shapes, invariants, derivation rules, and
firestore.rules _implications_. It is **NOT** the live `awardPoints` logic (that
is A2), the Point Rules admin UI (A1), or the rich Project dossier (C1).

Source of truth for the rules: `docs/reference/points-matrix.md` (the *Mejor
Miembro Individual* monthly competition) and the roadmap's "Recognition Engine —
rules that shape the model" section.

## Scope decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Attendable unit | **Unified `Activity`** with `category` + optional `parentId` (institutional events = `parentId` null). One attendance/QR path. |
| `PointRule` | **Fixed `PointRuleCode` enum** (16 matrix rows) with editable `points`; A2 maps `(role, parentType, category) → code` deterministically. |
| Ledger | **Denormalized `participations` rows** + **`memberPoints` aggregate doc**, both engine-written (client read-only). |
| Eligibility | **Hybrid** — derive `isExecutiveCommittee` (from `Term.board`) + `wonBestMemberPreviousTerm` (from `prevTerm.bestMemberId`); **store** `Member.isPastPresident`. |
| Beacon-safe subpath | **Ship now** — new pure `@luminova/types/engine` subpath (types only) for A2. |
| firestore.rules | **Documented only** this PR; edits land with A1/A2/D1. |
| I1 codegen-drift gate | **Deferred** to the I track. |

## Entities

All persisted shapes use `firebase` `Timestamp` via **type-only** import (erased
at build → self-contained `dist/.js`), matching the existing `member.ts`.

### `Term` — annual cycle (gestión)

```ts
interface Term {
  id: string;
  year: number;            // gestión calendar year — self-describing, not doc-id-derived
  label?: string;          // optional human label, e.g. "Gestión 2026"
  board: BoardSeat[];       // CEL + JDL roster
  conventionDate: Timestamp;
  pointsCutoffAt: Timestamp; // = conventionDate − 3 weeks (matrix cutoff)
  bestMemberId: string | null; // winner, set at term close → feeds next term's exclusion
  status: TermStatus;        // 'Activo' | 'Cerrado'
}

interface BoardSeat {
  memberId: string;
  title: string;             // chapter title (Spanish), e.g. "Presidenta" — NOT a permission role
  isExecutiveCommittee: boolean; // CEL flag → eligibility derivation
}
```

### `Program` / `Project` — distinct entities (engine-minimal)

Two separate collections. Engine-necessary fields only; **C1 extends `Project`**
with phases/budget/SDG/evidence/public-projection later. They share a shape but
are modelled as distinct types (different at their core per the matrix; different
point codes).

```ts
interface Program {
  id: string;
  termId: string;
  title: string;
  roster: InitiativeRoster;
  finalReport: FinalReport | null; // gate source for all child-activity points
  status: InitiativeStatus;         // 'Planificacion' | 'EnEjecucion' | 'Finalizado'
}

interface Project { /* identical shape, distinct type + distinct point codes */ }

interface InitiativeRoster {
  directorId: string;
  coDirectorId: string | null;
  teamIds: string[];
}

interface FinalReport {
  filedAt: Timestamp;
  filedBy: string;          // memberId of the director who filed
  // conclusions / economic report attachment refs are C1 (dossier) concerns
}
```

### `Activity` — the attendable unit (unified)

```ts
interface Activity {
  id: string;
  termId: string;
  category: ActivityCategory;
  parentType: 'Program' | 'Project' | null;
  parentId: string | null;   // null ⟺ institutional (Assembly/Course/Anniversary/TM/NationalEvent)
  organizers: ActivityOrganizers; // activity-level direction (may differ from parent roster)
  startAt: Timestamp;          // punctuality reference for check-in
  status: ActivityStatus;       // 'Programada' | 'Ejecutada' | 'Cancelada'
}

type ActivityCategory =
  | 'Assembly'        // Asamblea
  | 'Course'          // Curso oficial o libre
  | 'Anniversary'     // Aniversario (Local o Nacional)
  | 'TM'              // TM (Local o Nacional)
  | 'NationalEvent'   // Evento nacional
  | 'ProjectExecution'; // ejecución de un programa/proyecto (requires parentId)

interface ActivityOrganizers {
  directorId: string | null;
  coDirectorId: string | null;
}
```

> **Invariant A:** `category === 'ProjectExecution'` ⟺ `parentId !== null`. The
> other categories are institutional and MUST have `parentId === null`.

### `PointRule` — matrix mirror (fixed codes)

```ts
type PointRuleCode =
  | 'DirectProgram'      | 'CoDirectProgram'
  | 'DirectProject'      | 'CoDirectProject'
  | 'DirectActivity'     | 'CoDirectActivity'
  | 'ProgramProjectTeam'
  | 'AttendAssembly'     | 'AttendCourse'
  | 'AttendActivity'     | 'AttendNationalEvent'
  | 'AttendAnniversary'  | 'AttendTM'
  | 'HeadTrainer'        | 'AssistantTrainer'
  | 'PaymentPlanAdhesion';

interface PointRule {
  id: string;
  termId: string;          // point values are term-scoped (matrix can change between gestiones)
  code: PointRuleCode;
  points: number;
  label: string;           // Spanish display, e.g. "Dirección de programa"
}
```

Default point values (matrix baseline): DirectProgram 10, DirectProject 8,
DirectActivity 5, CoDirectProgram 8, CoDirectProject 6, CoDirectActivity 3,
ProgramProjectTeam 4, AttendAssembly 4, AttendCourse 3, AttendActivity 3,
AttendNationalEvent 5, AttendAnniversary 5, AttendTM 6, HeadTrainer 7,
AssistantTrainer 5, PaymentPlanAdhesion 5.

### `Participation` — ledger row (engine writes only)

```ts
type ParticipationRole = 'Director' | 'CoDirector' | 'Team' | 'Attendee';
type ParticipationState = 'provisional' | 'confirmed' | 'voided';

interface ParticipationGates {
  attendanceRegistered: boolean;
  finalReportFiled: boolean;  // only meaningful when the activity has a parent
}

interface Participation {
  id: string;
  memberId: string;
  termId: string;
  activityId: string;
  role: ParticipationRole;
  pointRuleCode: PointRuleCode;
  basePoints: number;          // snapshot of PointRule.points at award time
  punctualityFactor: 1 | 0.5;  // 1.0 for non-Attendee roles
  computedPoints: number;      // basePoints * punctualityFactor
  monthBucket: string;         // 'YYYY-MM' from the activity/check-in date
  state: ParticipationState;
  gates: ParticipationGates;
  checkInAt: Timestamp | null; // QR check-in timestamp (null for non-attendance rows)
  voidReason: string | null;   // e.g. 'DuesUnpaid:2026-06'
  createdAt: Timestamp;
}
```

### `MemberPoints` — derived aggregate (engine writes only)

```ts
interface MemberPoints {
  id: string;                  // === memberId
  termId: string;
  cumulative: number;          // Σ computedPoints of confirmed rows within term window
  byMonth: Record<string, number>; // { 'YYYY-MM': number } from confirmed rows
  updatedAt: Timestamp;
}
```

## Derivation rules & invariants (documented here; enforced by A2 at runtime)

1. **Every participation attaches to an `Activity`.** `pointRuleCode` is resolved
   from `(role, activity.parentType, activity.category)`:
   - Director + parentType Program → `DirectProgram`; Project → `DirectProject`;
     parentType null → `DirectActivity` (activity-level direction).
   - CoDirector → the `CoDirect*` peer of the above.
   - Team + parent (Program|Project) → `ProgramProjectTeam`.
   - Attendee → the `Attend*` code for the activity `category`
     (`Assembly→AttendAssembly`, `Course→AttendCourse`,
     `ProjectExecution→AttendActivity`, `NationalEvent→AttendNationalEvent`,
     `Anniversary→AttendAnniversary`, `TM→AttendTM`).
   - `HeadTrainer`/`AssistantTrainer`/`PaymentPlanAdhesion` are awarded by
     explicit role/event, not category-derived.
   - **Direction/team rows are emitted per activity** under the program/project
     (matrix: *"recibirán puntos por cada actividad que organicen"*).

2. **Punctuality factor** applies **only to `Attendee` rows**: `checkInAt ≤
   startAt + 15min → 1.0`, later → `0.5`. Director/CoDirector/Team rows are flat
   `1.0`.

3. **Gates → state:**
   - `attendanceRegistered` — always required (QR check-in or manual tap).
   - `finalReportFiled` — required **only when the activity has a parent**
     Program/Project (the parent's `finalReport !== null`). Institutional
     categories ignore this gate.
   - `state = 'confirmed'` ⟺ every *applicable* gate is `true`; otherwise
     `'provisional'`. `'voided'` overrides both (rule 4).

4. **Finance → Points coupling (read-only in F3):** the engine reads `duesStatus`
   (owned by Finance/J — **not** modelled here). A member not *al día* for a
   month ⇒ that month's rows become `state: 'voided'` with `voidReason`
   (restored to recomputed state on payment). Joining a payment plan emits a
   `PaymentPlanAdhesion` (+5) participation row. F3 only guarantees the ledger
   can **represent** `voided` + `voidReason`.

5. **`MemberPoints.cumulative` = Σ `computedPoints` of `confirmed` rows** within
   the term window (`createdAt`/`monthBucket ≤ Term.pointsCutoffAt`).
   `Member.totalPoints` mirrors `cumulative`. **Never authored directly** — the
   `totalPoints`/`memberPoints` immutability already enforced by `firestore.rules`
   (F1) stands.

6. **Eligibility is a derived function, not a stored verdict:**
   - `isExecutiveCommittee(member, term)` = `term.board` has the member with
     `isExecutiveCommittee: true`.
   - `wonBestMemberPreviousTerm(member, prevTerm)` = `prevTerm.bestMemberId ===
     member.id`.
   - `isPastPresident(member)` = stored `Member.isPastPresident`.
   - **Accrual vs competition:** past-presidents do **not** accrue. CEL members
     and the previous winner **do** accrue but are **excluded from the
     leaderboard** (A6). JDL directors accrue + compete normally.

> **Member shape change:** add `isPastPresident: boolean` (default `false`) to
> `Member` in `@luminova/types`. Existing seeded docs lack it → treat missing as
> `false` (table/engine guards), backfill optional.

## Packaging — `@luminova/types`

- New `packages/types/src/engine/` directory: `term.ts`, `program.ts`,
  `project.ts`, `activity.ts`, `point-rule.ts`, `participation.ts`,
  `member-points.ts` — **type-only `firebase` imports** so emitted `.js` is
  self-contained.
- Zod schemas alongside (`*-schema.ts`) where a write surface needs validation
  (A1 PointRule edit, D1 Activity/Program/Project create). Pure type files carry
  no zod.
- **New pure subpath export** `@luminova/types/engine` → re-exports the engine
  **types only** (no zod, no react) for beacon A2:

  ```jsonc
  "exports": {
    ".":        { "types": "./src/index.ts", "import": "./dist/index.js", "default": "./dist/index.js" },
    "./engine": { "types": "./src/engine/index.ts", "import": "./dist/engine/index.js", "default": "./dist/engine/index.js" }
  }
  ```

- Root barrel (`src/index.ts`) keeps exporting types **and** zod schemas (F2
  convention); it re-exports engine types too so existing root consumers are
  unaffected.
- No new dependencies expected (`zod`, `firebase` already in tree).

## firestore.rules implications (documented — NOT edited this PR)

| Collection | Client read | Client write |
|---|---|---|
| `terms` | signed-in | Admin only |
| `pointRules` | signed-in | Admin only |
| `programs` / `projects` | signed-in | ProjectManager/Admin (role-gated) |
| `activities` | signed-in | ProjectManager/Admin |
| `participations` | signed-in (public points are transparent) | **`if false`** — Admin-SDK/engine only |
| `memberPoints` | signed-in (already public per F1) | **`if false`** — engine only |

These edits land with A1 (`pointRules` write), A2 (`participations`/`memberPoints`
engine writes), and D1 (`activities`/`programs`/`projects` write). Each triggers
`/security-review` + `firestore-security-reviewer` at that time.

## Out of scope / deferred

- **Live `awardPoints` derivation logic** → A2 (this spec is the contract it
  implements).
- **Point Rules admin UI** → A1. **Activity/Program/Project CRUD** → D1.
- **Rich Project dossier** (phases, budget, SDG, evidence, public projection) → C1.
- **Social-media tiebreaker** (like 1 / comment 2 / share 3) → **not modelled**;
  add minimal fields when A6 leaderboard tiebreak is built (low-priority per matrix).
- **firestore.rules edits** → A1/A2/D1. **I1 codegen-drift gate** → I track.
- **`member.status → membershipStatus` rename** → lands with Finance (J), when
  `duesStatus` coexists.

## Testing strategy

- Zod schema tests (valid/invalid) for each write-surface schema, mirroring
  existing `member-schema.test.ts` / `ally-schema.test.ts`.
- Pure-function tests for the **eligibility derivation** helpers and the
  **`(role, parentType, category) → PointRuleCode`** resolver (these are pure,
  framework-free — testable in the types package without a DOM runner).
- Invariant A (`ProjectExecution ⟺ parentId`) asserted in the Activity schema's
  `superRefine`.
- `pnpm --filter @luminova/types run ci` (eslint + tsc + vitest) green;
  `pnpm pr-tests` green.
</content>
</invoke>
