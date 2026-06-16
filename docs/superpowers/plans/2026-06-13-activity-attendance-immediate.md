# Activity Attendance Immediate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Activity attendance points confirm immediately on check-in (not gated by the parent program/project report); check-ins are rejected once the activity's Bolivia-local day passes or the parent is `Finalizado`; activities list surfaces parented activities with a per-row check-in entry; check-in shows success/error toasts.

**Architecture:** Role-aware gate in the beacon engine (Attendee immediate, leadership still report-gated); a `withinCheckInWindow()` guard in `firestore.rules` (truth) mirrored by a client UX guard; backstage list + toast.

**Tech Stack:** Firebase Cloud Functions (beacon, vitest), Firestore security rules (@firebase/rules-unit-testing), React 19 + TanStack (backstage).

---

### Task A1: Engine — Attendee confirms immediately

**Files:** Modify `apps/beacon/src/award-points/derive.ts:65-67`; Test `apps/beacon/src/award-points/derive.test.ts`.

- [ ] **Step 1 — Update tests.** The existing "is provisional when a parented activity has no report yet" test must now expect `confirmed` for an Attendee. Replace it and add a leadership case:

```ts
it("confirms an attendee immediately even when a parented activity has no report", () => {
  const row = deriveParticipation({
    checkIn: checkIn(), activity: activity(), basePoints: 3, reportFiled: false,
  });
  expect(row?.state).toBe("confirmed");
  expect(row?.gates.finalReportFiled).toBe(true);
});

it("keeps a leadership check-in provisional until the parent report is filed", () => {
  const row = deriveParticipation({
    checkIn: checkIn({ role: "Director" }), activity: activity(), basePoints: 5, reportFiled: false,
  });
  expect(row?.state).toBe("provisional");
});
```

- [ ] **Step 2 — Run, expect fail:** `pnpm --filter beacon test -- derive`
- [ ] **Step 3 — Implement.** In `deriveParticipation`, replace lines 65-67:

```ts
const isLeadership = checkIn.role !== "Attendee";
const finalReportFiled =
  !isLeadership || activity.parentId === null ? true : reportFiled;
const attendanceRegistered = true;
const state = attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";
```

- [ ] **Step 4 — Run, expect pass:** `pnpm --filter beacon test -- derive`
- [ ] **Step 5 — Commit** `feat(beacon): attendance confirms immediately (role-aware report gate)`

---

### Task A2: Engine — report transition leaves attendance alone

**Files:** Modify `apps/beacon/src/award-points/process.ts:70-80`; Test `apps/beacon/src/award-points/process.test.ts`.

- [ ] **Step 1 — Test.** Add to process.test.ts: seed a parented activity + Attendee check-in (now confirmed), then a `processInitiativeWrite` with `reportFiled:false`, assert the attendance row stays `confirmed`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement.** In step-1 loop, skip Attendee rows:

```ts
for (const row of rows) {
  if (row.checkInAt === null) continue;
  if (row.role === "Attendee") continue; // attendance is immediate; report no longer gates it
  const finalReportFiled = init.reportFiled;
  ...
}
```

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit** `fix(beacon): report transition no longer re-gates attendance rows`

---

### Task B: firestore.rules — check-in window

**Files:** Modify `firestore.rules` (checkIns block + new helper); Test `tests/firestore-rules/rules.test.ts`.

- [ ] **Step 1 — Helper + rule.** Add above the `checkIns` match:

```
// Bolivia-local (UTC-4) calendar-day parts of a timestamp.
function boliviaDay(ts) {
  let local = ts - duration.time(4, 0, 0, 0);
  return [local.year(), local.month(), local.day()];
}
// A check-in is only valid on the activity's own Bolivia day, while the activity
// is not Cancelada and its parent initiative is not Finalizado.
function withinCheckInWindow(activityId) {
  let act = get(/databases/$(database)/documents/activities/$(activityId)).data;
  let parentColl = act.get('parentType', '') == 'Program' ? 'programs' : 'projects';
  let parentOpen = act.get('parentId', null) == null
    || get(/databases/$(database)/documents/$(parentColl)/$(act.parentId)).data.get('status', '') != 'Finalizado';
  return act.get('status', '') != 'Cancelada'
    && boliviaDay(request.time) == boliviaDay(act.startAt)
    && parentOpen;
}
```

Then gate create (both branches) by `&& withinCheckInWindow(request.resource.data.activityId)`.

- [ ] **Step 2 — Tests.** Seed in `beforeAll` (rules-disabled) activities with real `startAt`:
  - `act_today` (Assembly, parentId null, startAt `new Date()`)
  - `act_old` (Assembly, startAt `new Date(Date.now()-2*864e5)`)
  - `act_closed_parent` (ProjectExecution, parentId `p_closed`, startAt now) + `projects/p_closed` `{ status: "Finalizado" }`
  - `act_cancel` (Assembly, status "Cancelada", startAt now)
  Repoint existing `c_admin`/`c_pm`/`c_scan` check-ins to `act_today`; add scanner `scannerEventIds` to include `act_today`. New cases: admin same-day allow; admin old-day deny; admin closed-parent deny; admin cancelled deny.
- [ ] **Step 3 — Run, expect fail then implement (rule already added) → pass:** `pnpm --filter <rules-pkg> test` (see root `pr-tests`; rules run under the emulator).
- [ ] **Step 4 — Commit** `feat(rules): gate check-in create to the activity's Bolivia day + open parent`

---

### Task D: Check-in success/error toast

**Files:** Modify `apps/backstage/src/features/check-in/components/activity-check-in.tsx`; Test alongside existing check-in component tests.

- [ ] **Step 1 — Implement** (repo toast pattern = local state + timeout):

```tsx
const [toast, setToast] = useState<string | null>(null);
useEffect(() => {
  if (!toast) return;
  const t = setTimeout(() => setToast(null), 2600);
  return () => clearTimeout(t);
}, [toast]);

const checkIn = (memberId: string) => {
  if (alreadyCheckedIn(checkIns ?? [], memberId)) return;
  create.mutate(
    { memberId, activityId, role: "Attendee" },
    {
      onSuccess: () => setToast("Asistencia registrada"),
      onError: () => setToast("No se pudo registrar la asistencia"),
    },
  );
};
```

Render `{toast && <Toast message={toast} icon={Icon.check({ s: 18 })} />}` (import `Toast`, `Icon` from `@luminova/ui`).

- [ ] **Step 2 — Test** success toast appears on mutate success (mock repo resolve), error toast on reject.
- [ ] **Step 3 — Commit** `feat(backstage): toast feedback on check-in success/failure`

---

### Task C: Activities list — surface parented activities + check-in entry

**Files:** Modify `apps/backstage/src/routes/_app.activities.tsx` (+ list-item component as found).

- [ ] **Step 1 — Read the route**, confirm `getByTerm` rows include `ProjectExecution` (no parent filter). Add a parent badge when `parentType != null`. Make each row link to `/activities/$id` (its check-in tab) — gated by the existing `checkIn` ability; disabled/annotated when out of window (different Bolivia day or parent Finalizado), mirroring Task B.
- [ ] **Step 2 — Test** list renders a parented row with badge; row links to detail.
- [ ] **Step 3 — Commit** `feat(backstage): list parented activities with check-in entry`

---

### Gates (after all tasks)

- [ ] `pnpm pr-tests`
- [ ] `/security-review` (rules + functions changed)
- [ ] `firestore-security-reviewer` + `firebase-functions-reviewer` subagents
- [ ] `/simplify` on the diff
- [ ] Stop before PR (user will jump in).

## Self-review notes
- Spec coverage: A1+A2 = #4 + immediate attendance; B = window; C = #2/#3; D = #1. ✓
- Closed = `status == "Finalizado"` (existing field). ✓
- Existing rules tests reference unseeded `a1` → repointed in Task B Step 2. ✓
