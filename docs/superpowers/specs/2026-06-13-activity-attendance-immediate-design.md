# Activity attendance: immediate points + check-in window

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `feat/activity-attendance-immediate`

## Problem

Refining the QR/manual check-in flow surfaced four issues:

1. No user feedback when a check-in succeeds (or fails) — the mutation only
   invalidates its query.
2. Program/Project (`ProjectExecution`-parented) activities are not surfaced in
   the `/activities` list.
3. Listed activities have no entry point to check in.
4. **Check-in "does not add points."**

### Root cause of #4 (investigated, not guessed)

The full static path is correct (trigger registered in the fresh bundle,
`validateCheckIn` accepts the admin Timestamp, rules allow Admin/PM writes,
`resolvePointRuleCode` is exhaustive). The emulator log confirms `awardPoints`
fires and finishes clean. The "missing points" are a **design gate**, not a bug:

`derive.ts`:
```ts
const finalReportFiled = activity.parentId === null ? true : reportFiled;
const state = attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";
```

A parented activity's attendance row is written **`provisional`** until the parent
program/project files its final report; `aggregateFromRows` sums only `confirmed`
rows, so `memberPoints` / `members.totalPoints` stay 0. The activities under test
were `ProjectExecution`, so their attendance waited on the parent report.

## Decisions (from brainstorming)

- **Attendance is its own event.** Attendee check-in points confirm **immediately**,
  parented or not. **Leadership** (Director/CoDirector/Team roster points for the
  program/project) **stays report-gated** — unchanged.
- **Check-in window.** A check-in is rejected once **the activity's day has passed**
  (Bolivia local, UTC-4) **or the parent initiative is closed**.
- **Closed = `status === "Finalizado"`.** The explicit status field already exists
  (`InitiativeStatus = ["Planificacion", "EnEjecucion", "Finalizado"]`) — **no
  schema change**.

## Design

### Part A — Engine: attendance confirms immediately

`apps/beacon/src/award-points/derive.ts` — `deriveParticipation`:
- Make the report gate **role-aware**. `Attendee` → state depends only on
  `attendanceRegistered` ⇒ always `confirmed`. `Director/CoDirector/Team` (a
  leadership role arriving via check-in) → keep the report gate.
- `gates.finalReportFiled` is still recorded honestly (`true` for attendance — the
  report is not a gate for it).

`apps/beacon/src/award-points/process.ts` — `processInitiativeWrite` **step 1**
(re-confirm attendance rows on a report transition, lines ~70-80):
- **Skip `Attendee` rows.** A program/project report transition must no longer flip
  attendance provisional↔confirmed. Only leadership check-in rows (none produced by
  the UI today) remain governed by the report.

`deriveRosterRow` — **unchanged** (roster leadership stays report-gated).

**Existing provisional attendance rows:** re-derived on the next check-in write to
that `(activity, member)`; no automatic backfill (engine data is fresh / local).
An optional one-shot backfill script is out of scope for v1 — noted as a follow-up.

### Part B — Check-in window (trust boundary + client guard)

**Truth = `firestore.rules`.** The `checkIns/{id}` `create` rule gains a
`withinCheckInWindow(activityId)` guard, applied to **all** creators (Admin,
ProjectManager, Scanner). A create is allowed only when **all** hold:

1. `request.time` falls on the activity's **Bolivia-local calendar day**: shift both
   `request.time` and the activity's `startAt` by `- duration.time(4,0,0,0)` and
   compare `.year()/.month()/.day()`.
2. If the activity's `parentId != null`: `get(parent).data.status != "Finalizado"`.
3. Activity `status != "Cancelada"` (cheap correctness add).

The rule does `get(/activities/$(activityId))` plus a conditional `get` of the
parent (`programs`/`projects` per `parentType`) — within Firestore's document-access
budget. New rules tests: same-day allow, next-day deny, `Finalizado`-parent deny,
`Cancelada`-activity deny.

**Client UX guard** mirrors the rule (computed from `activity.startAt` Bolivia day +
parent status) to disable/annotate the check-in entry — the rule remains the
authority; the guard only avoids a confusing rejected write.

### Part C — Activities list + check-in entry

`apps/backstage/src/routes/_app.activities.tsx` (+ feature components):
- Verify `ActivityRepository.getByTerm` lists **all** activities including
  `ProjectExecution`; fix any parent filter that hides them. Add a **parent badge**
  (Program/Project title) on parented rows.
- Each row **links to `/activities/$id`** (its check-in tab), gated by the existing
  `ability.can("checkIn", subject("Attendance", { eventId }))`. When out-of-window,
  the entry is disabled/annotated (mirrors Part B).

### Part D — Check-in feedback

`apps/backstage/src/features/check-in/hooks/use-create-check-in.ts`:
- `onSuccess` → success toast ("Asistencia registrada").
- `onError` → error toast surfacing denied/failed writes (doubles as a permanent
  diagnostic for window/permission rejections).

## Testing

- **beacon units:** `deriveParticipation` role-aware (Attendee confirmed regardless
  of report; leadership still gated); `processInitiativeWrite` step 1 skips Attendee.
- **firestore.rules tests:** window allow/deny matrix (same-day, next-day,
  Finalizado parent, Cancelada activity), preserving existing Admin/PM/Scanner gates.
- **backstage vitest:** toast on success/error; list renders parented activities with
  badge; entry disabled when out-of-window.
- **Gates:** `pnpm pr-tests` → `/security-review` (rules + functions) →
  `firestore-security-reviewer` + `firebase-functions-reviewer` → `/simplify`.

## Out of scope / follow-ups

- One-shot backfill of pre-existing provisional attendance rows.
- Trigger-side defense-in-depth re-check of the window (rules are the gate; YAGNI).
- Non-Attendee check-ins via UI (Admin "register any role") — the role-aware gate
  already handles them correctly, but the UI does not expose them.
