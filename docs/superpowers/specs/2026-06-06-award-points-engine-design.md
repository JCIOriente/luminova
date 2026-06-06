# A2 — awardPoints (Recognition Engine compute) — Design

_Date: 2026-06-06 · Branch: `feat/award-points` · Status: approved_

## Goal

Replace the beacon `awardPoints` "not implemented" stub with the real Recognition
Engine compute logic. From a participation **fact** (`checkIns`) and the term's
`pointRules`, derive the engine-owned `participations` ledger row (resolve code →
base points, punctuality factor, gates → state, month bucket) and recompute the
`memberPoints/{memberId}` aggregate. Retire the stale `events/{id}` trigger and the
nested `memberPoints/{year}/{month}/{eventId}` path (both predate the F3 model).

Implements the F3 contract (`docs/superpowers/specs/2026-06-06-recognition-engine-model-design.md`)
using the pure helpers in `@luminova/types/engine`.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Trigger / input | New client-written `checkIns/{id}` input; `awardPoints` triggers `onDocumentWritten('checkIns/{id}')` → derives the engine-only `participations` row. Keeps `participations` engine-only (F3 rule), no self-trigger loop. |
| Row identity | `participations/{activityId__memberId__role}` — one row per (activity, member, role); duplicate checkIns + re-fired triggers overwrite, never double-count. |
| Confirmation | 2nd trigger on `programs`/`projects`: when `finalReport` flips null→set, confirm that initiative's rows (and revert on set→null). |
| Aggregate | Full recompute from confirmed rows on every change (idempotent, self-healing); mirror `cumulative` onto `members.totalPoints`. |
| Roles | Role arrives **on the checkIn fact** in v1 (no roster auto-expansion). |
| Dues coupling | **Deferred to J4** (Finance not built). |

## Data flow

```
checkIns/{id}                      client-written (Scanner/Admin/ProjectManager)
  { memberId, activityId, role, checkInAt }
        │ onDocumentWritten('checkIns/{id}')
        ▼
awardPoints (admin SDK):
  read activities/{activityId}     -> category, parentType, parentId, startAt, termId
  read pointRules/{termId__code}   -> basePoints (A1 deterministic id; fallback DEFAULT_POINT_VALUES)
  derive participation fields
        ▼
  set participations/{activityId__memberId__role}   (engine-only)
        ▼
  recompute memberPoints/{memberId} + members/{memberId}.totalPoints

programs/{id} | projects/{id}       finalReport null -> set
        │ onDocumentWritten
        ▼
  query participations where parentId == id
  set finalReportFiled + state on each
  recompute each affected member's aggregate
```

## Input collection — `checkIns/{id}`

```ts
interface CheckIn {
  memberId: string;
  activityId: string;
  role: ParticipationRole;   // Director | CoDirector | Team | Attendee
  checkInAt: Timestamp;
}
```

A2 introduces this as the engine's input contract. A3 (QR check-in) writes these
and may refine the Scanner-scoped rule. It is **not** promoted to `@luminova/types`
yet — it lives as a beacon-local input shape (A3 will own the client/type when the
UI lands). Validation happens in the trigger (see Error handling).

## firestore.rules

`participations` / `memberPoints` are already client-write-denied (F1). Add:

```
match /checkIns/{checkInId} {
  allow read: if signedIn();
  allow create: if hasAnyRole(['Admin', 'ProjectManager'])
    || (hasAnyRole(['Scanner'])
        && request.resource.data.activityId in (request.auth.token.scannerEventIds));
  allow update, delete: if false;
}
```

`create`-only (a checkIn is an immutable fact; corrections = a new checkIn that
overwrites the derived row). Scanner is scoped to its assigned activities, mirroring
the F1 `checkIn Attendance {eventId in scannerEventIds}` ability. Rules tests:
Admin/ProjectManager create; Scanner create only for an in-scope activityId; Scanner
denied out-of-scope; non-privileged denied; update/delete denied; signed-in read.

> If `scannerEventIds` is absent on the token, the `in` check evaluates false →
> Scanner denied, which is the safe default. The rule guards with a present-claim
> assumption; tests cover the absent-claim path.

## `@luminova/types` amendment (F3 follow-up)

Add denormalized parent fields to `Participation` so Trigger 2's confirm query is a
single `where('parentId','==', id)`:

```ts
// participation.ts
export interface Participation {
  // ...existing...
  parentType: InitiativeKind | null; // denormalized from the activity
  parentId: string | null;           // denormalized from the activity
}
```

`InitiativeKind` is already exported from `engine/activity.ts`. Update the F3
data-models doc. No other consumer authors `Participation`, so this is additive.

## beacon structure

```
apps/beacon/src/
  award-points/
    check-in.ts            # CheckIn shape + a zod-free runtime validator (beacon-local)
    derive.ts              # PURE: deriveParticipation(...) -> participation doc fields
    derive.test.ts
    aggregate.ts           # PURE: aggregateFromRows(rows) -> { cumulative, byMonth }
    aggregate.test.ts
    triggers.ts            # impure: onCheckInWritten, onInitiativeReportWritten handlers
    firestore.ts           # thin Firestore accessors (read activity/pointRule, set row, recompute)
  index.ts                 # exports awardPoints, confirmOnProgramReport, confirmOnProjectReport, setUserRoles; admin init
  index.test.ts            # updated (drop events trigger + nested path assertions)
  set-user-roles.ts        # unchanged (F1)
```

Add `@luminova/types: workspace:*` to beacon deps. Consume the **pure subpath**
`@luminova/types/engine` (`resolvePointRuleCode`, `computePunctualityFactor`,
`DEFAULT_POINT_VALUES`, `PointRuleCode`, `ParticipationRole`, `InitiativeKind`,
types). No zod/firebase-client pulled in (verified beacon-safe in F3).

### Pure: `derive.ts`

`deriveParticipation({ checkIn, activity, basePoints })` returns the participation
document fields:
- `pointRuleCode = resolvePointRuleCode({ role, parentType: activity.parentType, category: activity.category })`. If `null` (e.g. Team on an institutional activity), the caller skips (no row written) — logged.
- `punctualityFactor = computePunctualityFactor({ role, checkInAt, startAt: activity.startAt })`.
- `computedPoints = basePoints * punctualityFactor`.
- `monthBucket` = `YYYY-MM` from `activity.startAt` (UTC).
- `gates = { attendanceRegistered: true, finalReportFiled: activity.parentId === null ? true : reportFiled }` (caller passes `reportFiled` from the parent read; for the checkIn trigger it reads the parent initiative).
- `state = (attendanceRegistered && finalReportFiled) ? 'confirmed' : 'provisional'`.
- `parentType`/`parentId` copied from the activity; `memberId`/`termId`/`activityId`/`role`/`checkInAt` from inputs; `voidReason: null`.

A pure `monthBucketOf(ts: Timestamp): string` helper (`ts.toMillis()` → UTC year-month) lives here, testable without firebase by passing a `{ toMillis }`-shaped value.

### Pure: `aggregate.ts`

`aggregateFromRows(rows: Pick<Participation,'computedPoints'|'monthBucket'|'state'>[])`
→ `{ cumulative, byMonth }`: sum `computedPoints` of `state === 'confirmed'` rows;
group the same into `byMonth['YYYY-MM']`. (Term-window cutoff `pointsCutoffAt` is
applied later when Term carries a real convention date — for v1 all confirmed rows
count; noted as a follow-up so the omission isn't silent.)

### Impure: `triggers.ts` + `firestore.ts`

- `onCheckInWritten`: on create/update of a checkIn, validate it; read activity (no-op + log if missing); read `pointRules/{termId__code}` (fallback `DEFAULT_POINT_VALUES[code]`); read parent initiative if `parentId` (for `reportFiled`); `deriveParticipation`; `set participations/{id}` (deterministic); recompute aggregate. On checkIn **delete**, delete the derived row + recompute.
- `onInitiativeReportWritten(parentType, event)`: shared handler bound by two thin
  exported functions — `confirmOnProgramReport` (`programs/{id}`) and
  `confirmOnProjectReport` (`projects/{id}`), since one `onDocumentWritten` binds one
  path. If `finalReport` transitioned null→set (or set→null), query `participations
  where parentId == id`, recompute each row's gate+state, batch-write, recompute each
  affected member's aggregate.
- `recomputeMemberAggregate(memberId, termId)`: query confirmed rows, `aggregateFromRows`, `set memberPoints/{memberId}` + `update members/{memberId}.totalPoints`.

## Idempotency & error handling (firebase-functions-reviewer checklist)

- **Idempotent:** deterministic participation id; full-recompute aggregate; both safe under at-least-once redelivery.
- **Validation:** the trigger validates the checkIn shape (memberId/activityId/role non-empty, role ∈ `PARTICIPATION_ROLES`, checkInAt is a Timestamp) before any read; invalid → log + return (no throw → no infinite retry).
- **Missing refs:** missing activity / parent → log + no-op (don't throw).
- **No client SDK:** admin SDK only; lazy `initializeApp()` (existing pattern).
- **No secrets / PII logging:** log ids, not member data.

## Testing strategy

- **Pure** (`derive.test.ts`, `aggregate.test.ts`): code resolution, punctuality
  factor application, gate/state for institutional vs parented + report-filed vs
  not, monthBucket from a timestamp, aggregate sum + byMonth + confirmed-only filter,
  skip-on-null-code.
- **Impure** (`triggers` with a mocked Firestore boundary): checkIn → participation
  written with right id + fields; missing activity → no-op; report null→set → rows
  confirmed + aggregate updated; duplicate checkIn → single row (idempotent).
- **Rules** (`tests/firestore-rules`): `checkIns` create/read/scoping cases.
- Gates: `pnpm --filter beacon run ci`, `pnpm --filter @luminova/types run ci`,
  rules tests, `firebase-functions-reviewer` + `/security-review`, `pnpm pr-tests`.

## Out of scope / deferred

- **Dues→Points voiding** (`voided` state on unpaid months, +5 payment-plan row) → J4.
- **Roster auto-expansion** (deriving director/coDirector/team rows from a
  Program/Project roster when an activity executes) → v1 takes the role on the
  checkIn fact; revisit with D1/A3.
- **Term-window cutoff** (`pointsCutoffAt`) in the aggregate → when Term carries a
  real convention date (Term admin).
- **A3 QR check-in UI** + Scanner-scoped client + offline queue (A4).
- **`CheckIn` promotion to `@luminova/types`** → with A3.
- **Functions-deploy packaging** of `@luminova/types`/`@luminova/auth` for prod
  bundling → still deferred (emulator + tests only here).
