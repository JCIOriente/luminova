# A7 — Roster → participation auto-expansion — design

_Date: 2026-06-06 · App: `apps/beacon` (+ pure helper in the engine) · Branch: `feat/roster-expansion`_

## Goal

Make an initiative's roster the authoritative source of its Director / CoDirector /
Team recognition points. When D1 writes a `programs`/`projects` roster, the engine
derives the matching `participation` rows (DirectProject / CoDirectProject /
ProgramProjectTeam, or the Program variants) — no manual per-person check-in tap —
confirms them when the final report is filed, and voids them when a member leaves
the roster. Closes the v1 trust-model gap (#7) where initiative roles were tapped
on the checkIn fact.

## Decisions (locked in brainstorm)

- **monthBucket = report-filed month.** A roster row is created `provisional` with a
  preserved/creation-month bucket (inert — provisional rows don't count); when the
  report trigger confirms it, `monthBucket` is stamped to the `finalReport.filedAt`
  month. Roster rows are identified by `checkInAt === null` (attendance rows always
  have a Timestamp), so attendance rows keep their own activity month.
- **Expand Director + CoDirector + Team** — the roster is the single authoritative
  source for all three initiative roles. Convention: execution-activity check-ins
  use the **Attendee** role (attendance points, distinct code) so a team member
  earns `ProgramProjectTeam` once (from the roster) + `AttendActivity` from
  attending. A guard against `Team`/`Director` check-in double-counting is **deferred
  hardening**, not v1.
- **No `firestore.rules` change** — `participations` stay `write: if false`; A7
  writes them via the admin SDK (bypasses rules), like the rest of the engine.

## Architecture — unify report + roster into one reconcile

The existing `confirmOnProgramReport` / `confirmOnProjectReport` triggers fire on
`programs`/`projects` writes but only act on `finalReport` transitions. A7
generalizes them — beacon isn't deployed yet, so the rename is free and clearer:

- **`onProgramWritten` / `onProjectWritten`** (`onDocumentWritten('programs|projects/{id}')`)
  → `processInitiativeWrite(store, parentType, parentId, after)`.

`processInitiativeWrite` runs on every initiative write and reconciles idempotently:

1. `reportFiled = after.finalReport != null`; `filedAtMillis = after.finalReport?.filedAt?.toMillis()`.
2. **Desired roster rows** from `after.roster`: `directorId → Director`,
   `coDirectorId → CoDirector`, each `teamIds[] → Team` (skip nulls/empties).
   `termId` from `after.termId`.
3. Load `getRowsByParent(parentId)`; split by `checkInAt`:
   - **attendance rows** (`checkInAt != null`): re-confirm per `reportFiled` (the
     existing report behavior) — keep their activity `monthBucket`.
   - **roster rows** (`checkInAt === null`): the reconcile target.
4. **Reconcile roster rows**: upsert each desired row (deterministic id
   `participationId(parentId, memberId, role)` — anchors on the initiative id as
   `activityId`); **delete** any existing roster row not in the desired set
   (member removed → void).
5. Recompute aggregates for every affected member (added, removed, re-confirmed).

A title edit, a roster change, and a report filing all flow through this one pass.
`processInitiativeReport` is replaced by `processInitiativeWrite`.

## Roster row derivation — pure helper

`apps/beacon/src/award-points/derive-roster.ts` — `deriveRosterRow(input): Participation`
(consumes `@luminova/types/engine`, beside `deriveParticipation`):

```
input: {
  parentType: InitiativeKind; parentId: string; termId: string;
  memberId: string; role: "Director"|"CoDirector"|"Team";
  basePoints: number; reportFiled: boolean;
  filedAtMillis: number | null; fallbackMonth: string;
}
```

Produces a `Participation`:
- `id = participationId(parentId, memberId, role)`, `activityId = parentId`,
  `parentType`, `parentId`, `role`, `pointRuleCode = resolvePointRuleCode({role,
  parentType, category})` (category is irrelevant for non-Attendee roles),
  `basePoints`, `punctualityFactor: 1`, `computedPoints = basePoints`,
  `checkInAt: null`, `voidReason: null`, `createdAt` (passed through / serverTimestamp).
- `gates: { attendanceRegistered: true, finalReportFiled: reportFiled }`,
  `state: reportFiled ? "confirmed" : "provisional"`.
- `monthBucket: reportFiled && filedAtMillis != null ? monthOf(filedAtMillis) : fallbackMonth`.

`monthOf(ms)` = UTC `YYYY-MM` (reuse `monthBucketOf` from `derive.ts`, adapted to
take millis or a Timestamp-like).

**Idempotency:** the reconcile reads each desired row's existing doc
(`getParticipation(id)`) to source `fallbackMonth` (existing `monthBucket` if the
row already exists, else current month) and `createdAt`. So re-running while
provisional preserves the bucket; once confirmed it's pinned to the report month.

## EngineStore

No new methods. `getRowsByParent`, `getParticipation`, `setParticipation`,
`deleteParticipation`, `getPointRulePoints`, `getConfirmedRows`,
`setMemberAggregate` already exist. Orchestration is unit-tested against the
in-memory fake store (beacon's established pattern — no firebase-admin mocking).

The trigger handler parses `after.roster` + `after.finalReport` + `after.termId`
straight from the event data and passes them in; `firestore-store` only needs its
existing reads/writes.

## Point codes (via `resolvePointRuleCode`)

| role | parentType Program | parentType Project |
|---|---|---|
| Director | DirectProgram | DirectProject |
| CoDirector | CoDirectProgram | CoDirectProject |
| Team | ProgramProjectTeam | ProgramProjectTeam |

`basePoints` = `getPointRulePoints(termId, code) ?? DEFAULT_POINT_VALUES[code]`
(same as the check-in path).

## Testing

- **Pure `derive-roster.test.ts`**: row shape per role/parent; code resolution;
  confirmed-vs-provisional state + gates; `monthBucket` (report month when filed,
  fallback otherwise); `computedPoints == basePoints`, `punctualityFactor == 1`,
  `checkInAt == null`.
- **`process.test.ts`** (fake store): add roster → 3 provisional rows; file report
  → all confirmed + `monthBucket == report month` + aggregate cumulative reflects
  them; remove a team member → that row deleted + their aggregate drops to 0;
  re-run an unchanged write → no net change (idempotent); a co-director set to null
  → its row voided; attendance rows under the same parent are re-confirmed but keep
  their activity month.
- **Reviews**: `firebase-functions-reviewer` on the new/renamed triggers +
  orchestration. No `/security-review` trigger (no rules/auth/secret change).
- **Emulator e2e** (`tools/scripts/`): extend the existing harness to write a
  project roster → assert 3 participations → file report → assert confirmed +
  memberPoints. Run if not too heavyweight; otherwise the fake-store orchestration
  tests cover the logic (flag in the status doc).

## Non-goals / deferred

- The Team/Director check-in double-count guard (convention only in v1).
- Roster-member existence validation (D1 supplies trusted, member-picked ids).
- Per-activity director attribution (roster is initiative-level).
- Prod functions bundling/deploy (still emulator-verified).

## Verification

- `pnpm --filter beacon run ci` (eslint + tsc + vitest).
- `pnpm --filter @luminova/types run ci` (if the engine helper touches types — it
  reuses existing exports, so likely no type change).
- `pnpm pr-tests` before PR. Rebuild beacon dist before any emulator run
  (`pnpm --filter beacon build`) — the functions emulator runs stale dist otherwise.
