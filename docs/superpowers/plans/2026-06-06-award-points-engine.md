# awardPoints Engine (A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the beacon `awardPoints` stub with real compute: a `checkIns` input trigger derives engine-only `participations` rows (code → base → punctuality → gates → state) and recomputes `memberPoints`; report triggers confirm parented rows.

**Architecture:** Pure derivation/aggregate helpers (consume `@luminova/types/engine`) + orchestration written against an injected **store port** (unit-tested with a fake) + thin `firebase-functions` trigger bindings (admin SDK store impl). NodeNext modules — relative imports use `.js`.

**Tech Stack:** firebase-admin 13, firebase-functions 7 (v2 `onDocumentWritten`), `@luminova/types/engine`, vitest 4. NodeNext.

---

## File structure

```
packages/types/src/engine/
  participation.ts          # MODIFY: + parentType, parentId
apps/beacon/
  package.json              # MODIFY: + @luminova/types dep
  src/
    award-points/
      check-in.ts            # CheckIn shape + validateCheckIn (pure)
      check-in.test.ts
      participation-id.ts    # participationId(activityId,memberId,role) (pure)
      derive.ts              # monthBucketOf + deriveParticipation (pure)
      derive.test.ts
      aggregate.ts           # aggregateFromRows (pure)
      aggregate.test.ts
      store.ts               # EngineStore port + ActivityRef type
      process.ts             # processCheckIn / processCheckInDelete / processInitiativeReport / recomputeAggregate (orchestration, store-injected)
      process.test.ts        # with an in-memory fake store
      firestore-store.ts     # admin-SDK EngineStore impl (impure; not unit-tested)
    index.ts                 # MODIFY: trigger bindings; drop events trigger + nested path; keep setUserRoles
    index.test.ts            # MODIFY: assert new exports
firestore.rules              # MODIFY: + checkIns
tests/firestore-rules/rules.test.ts  # MODIFY: + checkIns cases
docs/data-models.md          # MODIFY: Participation parent fields + checkIns
```

---

## Task 1: Amend `Participation` (denormalized parent) — types

**Files:**
- Modify: `packages/types/src/engine/participation.ts`

- [ ] **Step 1: Add the parent fields**

In `participation.ts`, import `InitiativeKind` and add the two fields to the interface:

```ts
import type { Timestamp } from "firebase/firestore";
import type { PointRuleCode } from "./point-rule";
import type { InitiativeKind } from "./activity";
```

Add inside `interface Participation` (after `activityId`):

```ts
  parentType: InitiativeKind | null; // denormalized from the activity (for report-gate query)
  parentId: string | null;
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @luminova/types run ci`
Expected: PASS (additive; no consumer authors Participation yet).

```bash
git add packages/types/src/engine/participation.ts
git commit -m "feat(types): denormalize parentType/parentId onto Participation"
```

---

## Task 2: Add `@luminova/types` to beacon + build

**Files:**
- Modify: `apps/beacon/package.json`

- [ ] **Step 1: Add the dependency**

In `apps/beacon/package.json` `dependencies`, add (keep alphabetical with `@luminova/auth`):

```json
    "@luminova/types": "workspace:*",
```

- [ ] **Step 2: Install + build types**

Run: `pnpm install && pnpm --filter @luminova/types build`
Expected: lockfile updates; `@luminova/types` emits `dist/engine/index.js`.

- [ ] **Step 3: Smoke-check the subpath resolves under NodeNext**

Run: `pnpm --filter beacon exec node --input-type=module -e "import('@luminova/types/engine').then(m=>console.log(typeof m.resolvePointRuleCode))"`
Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add apps/beacon/package.json pnpm-lock.yaml
git commit -m "chore(beacon): depend on @luminova/types for the engine model"
```

---

## Task 3: `participationId` + `check-in.ts` validator (pure, TDD)

**Files:**
- Create: `apps/beacon/src/award-points/participation-id.ts`
- Create: `apps/beacon/src/award-points/check-in.ts`
- Test: `apps/beacon/src/award-points/check-in.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { participationId } from "./participation-id.js";
import { validateCheckIn } from "./check-in.js";

const ts = { toMillis: () => 1_000 } as unknown as import("firebase-admin/firestore").Timestamp;

describe("participationId", () => {
  it("is deterministic per (activity, member, role)", () => {
    expect(participationId("a1", "m1", "Attendee")).toBe("a1__m1__Attendee");
  });
});

describe("validateCheckIn", () => {
  it("accepts a well-formed check-in", () => {
    expect(validateCheckIn({ memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: ts })).toEqual({
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
      checkInAt: ts,
    });
  });

  it("rejects an unknown role", () => {
    expect(validateCheckIn({ memberId: "m1", activityId: "a1", role: "Boss", checkInAt: ts })).toBeNull();
  });

  it("rejects missing ids or timestamp", () => {
    expect(validateCheckIn({ memberId: "", activityId: "a1", role: "Attendee", checkInAt: ts })).toBeNull();
    expect(validateCheckIn({ memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: null })).toBeNull();
    expect(validateCheckIn(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/award-points/check-in.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `participation-id.ts`**

```ts
import type { ParticipationRole } from "@luminova/types/engine";

export function participationId(activityId: string, memberId: string, role: ParticipationRole): string {
  return `${activityId}__${memberId}__${role}`;
}
```

- [ ] **Step 4: Implement `check-in.ts`**

```ts
import type { Timestamp } from "firebase-admin/firestore";
import { PARTICIPATION_ROLES, type ParticipationRole } from "@luminova/types/engine";

export interface CheckIn {
  memberId: string;
  activityId: string;
  role: ParticipationRole;
  checkInAt: Timestamp;
}

function isTimestamp(value: unknown): value is Timestamp {
  return typeof (value as { toMillis?: unknown })?.toMillis === "function";
}

/** Validate a raw check-in document. Returns the typed CheckIn or null (no throw — avoids retry storms). */
export function validateCheckIn(data: unknown): CheckIn | null {
  const raw = (data ?? {}) as Record<string, unknown>;
  if (typeof raw.memberId !== "string" || raw.memberId.length === 0) return null;
  if (typeof raw.activityId !== "string" || raw.activityId.length === 0) return null;
  if (!PARTICIPATION_ROLES.includes(raw.role as ParticipationRole)) return null;
  if (!isTimestamp(raw.checkInAt)) return null;
  return {
    memberId: raw.memberId,
    activityId: raw.activityId,
    role: raw.role as ParticipationRole,
    checkInAt: raw.checkInAt,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/award-points/check-in.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/beacon/src/award-points/participation-id.ts apps/beacon/src/award-points/check-in.ts apps/beacon/src/award-points/check-in.test.ts
git commit -m "feat(beacon): check-in validator + deterministic participation id"
```

---

## Task 4: `derive.ts` — pure participation derivation (TDD)

**Files:**
- Create: `apps/beacon/src/award-points/derive.ts`
- Test: `apps/beacon/src/award-points/derive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { deriveParticipation, monthBucketOf, type ActivityRef } from "./derive.js";
import type { CheckIn } from "./check-in.js";

const startAt = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));

function activity(overrides: Partial<ActivityRef> = {}): ActivityRef {
  return {
    id: "a1",
    termId: "2026",
    category: "ProjectExecution",
    parentType: "Project",
    parentId: "p1",
    startAt,
    ...overrides,
  };
}
function checkIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return { memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: startAt, ...overrides };
}

describe("monthBucketOf", () => {
  it("formats a timestamp as UTC YYYY-MM", () => {
    expect(monthBucketOf(startAt)).toBe("2026-06");
  });
});

describe("deriveParticipation", () => {
  it("derives a confirmed attendee row when the report is filed", () => {
    const row = deriveParticipation({ checkIn: checkIn(), activity: activity(), basePoints: 3, reportFiled: true });
    expect(row).toMatchObject({
      id: "a1__m1__Attendee",
      memberId: "m1",
      termId: "2026",
      activityId: "a1",
      role: "Attendee",
      pointRuleCode: "AttendActivity",
      basePoints: 3,
      punctualityFactor: 1,
      computedPoints: 3,
      monthBucket: "2026-06",
      parentType: "Project",
      parentId: "p1",
      state: "confirmed",
      gates: { attendanceRegistered: true, finalReportFiled: true },
      voidReason: null,
    });
  });

  it("is provisional when a parented activity has no report yet", () => {
    const row = deriveParticipation({ checkIn: checkIn(), activity: activity(), basePoints: 3, reportFiled: false });
    expect(row.state).toBe("provisional");
    expect(row.gates.finalReportFiled).toBe(false);
  });

  it("confirms an institutional activity with no parent (report gate N/A)", () => {
    const row = deriveParticipation({
      checkIn: checkIn(),
      activity: activity({ category: "Assembly", parentType: null, parentId: null }),
      basePoints: 4,
      reportFiled: false,
    });
    expect(row.pointRuleCode).toBe("AttendAssembly");
    expect(row.state).toBe("confirmed");
    expect(row.gates.finalReportFiled).toBe(true);
  });

  it("halves points for a late attendee", () => {
    const late = Timestamp.fromDate(new Date("2026-06-06T18:30:00Z"));
    const row = deriveParticipation({
      checkIn: checkIn({ checkInAt: late }),
      activity: activity({ category: "Assembly", parentType: null, parentId: null }),
      basePoints: 4,
      reportFiled: true,
    });
    expect(row.punctualityFactor).toBe(0.5);
    expect(row.computedPoints).toBe(2);
  });

  it("returns null when no rule applies (Team on an institutional activity)", () => {
    const row = deriveParticipation({
      checkIn: checkIn({ role: "Team" }),
      activity: activity({ category: "Assembly", parentType: null, parentId: null }),
      basePoints: 4,
      reportFiled: true,
    });
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/award-points/derive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `derive.ts`**

```ts
import type { Timestamp } from "firebase-admin/firestore";
import {
  resolvePointRuleCode,
  computePunctualityFactor,
  type ActivityCategory,
  type InitiativeKind,
  type Participation,
} from "@luminova/types/engine";
import type { CheckIn } from "./check-in.js";
import { participationId } from "./participation-id.js";

/** The activity facts the engine needs (read from activities/{id}). */
export interface ActivityRef {
  id: string;
  termId: string;
  category: ActivityCategory;
  parentType: InitiativeKind | null;
  parentId: string | null;
  startAt: Timestamp;
}

/** UTC `YYYY-MM` for a Firestore Timestamp. */
export function monthBucketOf(ts: Timestamp): string {
  const date = new Date(ts.toMillis());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export interface DeriveInput {
  checkIn: CheckIn;
  activity: ActivityRef;
  basePoints: number;
  reportFiled: boolean;
}

/**
 * Derive the full participation document from a check-in + its activity.
 * Returns null when no point rule applies (the caller writes no row).
 * `createdAt` is the check-in time (deterministic — keeps overwrites idempotent).
 */
export function deriveParticipation({ checkIn, activity, basePoints, reportFiled }: DeriveInput): Participation | null {
  const pointRuleCode = resolvePointRuleCode({
    role: checkIn.role,
    parentType: activity.parentType,
    category: activity.category,
  });
  if (pointRuleCode === null) return null;

  const punctualityFactor = computePunctualityFactor({
    role: checkIn.role,
    checkInAt: checkIn.checkInAt,
    startAt: activity.startAt,
  });
  const finalReportFiled = activity.parentId === null ? true : reportFiled;
  const attendanceRegistered = true;
  const state = attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";

  return {
    id: participationId(activity.id, checkIn.memberId, checkIn.role),
    memberId: checkIn.memberId,
    termId: activity.termId,
    activityId: activity.id,
    role: checkIn.role,
    pointRuleCode,
    basePoints,
    punctualityFactor,
    computedPoints: basePoints * punctualityFactor,
    monthBucket: monthBucketOf(activity.startAt),
    state,
    gates: { attendanceRegistered, finalReportFiled },
    checkInAt: checkIn.checkInAt,
    voidReason: null,
    createdAt: checkIn.checkInAt,
    parentType: activity.parentType,
    parentId: activity.parentId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/award-points/derive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/derive.ts apps/beacon/src/award-points/derive.test.ts
git commit -m "feat(beacon): pure participation derivation"
```

---

## Task 5: `aggregate.ts` — pure aggregate (TDD)

**Files:**
- Create: `apps/beacon/src/award-points/aggregate.ts`
- Test: `apps/beacon/src/award-points/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { aggregateFromRows } from "./aggregate.js";

describe("aggregateFromRows", () => {
  it("sums confirmed computedPoints into cumulative + byMonth", () => {
    const agg = aggregateFromRows([
      { computedPoints: 3, monthBucket: "2026-06", state: "confirmed" },
      { computedPoints: 5, monthBucket: "2026-06", state: "confirmed" },
      { computedPoints: 4, monthBucket: "2026-07", state: "confirmed" },
    ]);
    expect(agg).toEqual({ cumulative: 12, byMonth: { "2026-06": 8, "2026-07": 4 } });
  });

  it("ignores provisional and voided rows", () => {
    const agg = aggregateFromRows([
      { computedPoints: 3, monthBucket: "2026-06", state: "confirmed" },
      { computedPoints: 9, monthBucket: "2026-06", state: "provisional" },
      { computedPoints: 9, monthBucket: "2026-06", state: "voided" },
    ]);
    expect(agg).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("is empty for no rows", () => {
    expect(aggregateFromRows([])).toEqual({ cumulative: 0, byMonth: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/award-points/aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `aggregate.ts`**

```ts
import type { Participation } from "@luminova/types/engine";

export type AggregateRow = Pick<Participation, "computedPoints" | "monthBucket" | "state">;

export interface MemberAggregate {
  cumulative: number;
  byMonth: Record<string, number>;
}

/** Sum confirmed rows into cumulative + per-month totals. */
export function aggregateFromRows(rows: AggregateRow[]): MemberAggregate {
  const byMonth: Record<string, number> = {};
  let cumulative = 0;
  for (const row of rows) {
    if (row.state !== "confirmed") continue;
    cumulative += row.computedPoints;
    byMonth[row.monthBucket] = (byMonth[row.monthBucket] ?? 0) + row.computedPoints;
  }
  return { cumulative, byMonth };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/award-points/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/aggregate.ts apps/beacon/src/award-points/aggregate.test.ts
git commit -m "feat(beacon): pure member-points aggregate"
```

---

## Task 6: `store.ts` port + `process.ts` orchestration (TDD with fake store)

**Files:**
- Create: `apps/beacon/src/award-points/store.ts`
- Create: `apps/beacon/src/award-points/process.ts`
- Test: `apps/beacon/src/award-points/process.test.ts`

- [ ] **Step 1: Define the store port**

`store.ts`:

```ts
import type { PointRuleCode, InitiativeKind, Participation } from "@luminova/types/engine";
import type { ActivityRef } from "./derive.js";
import type { AggregateRow, MemberAggregate } from "./aggregate.js";

/** All Firestore access the engine needs, behind an interface so the orchestration is unit-testable. */
export interface EngineStore {
  getActivity(activityId: string): Promise<ActivityRef | null>;
  /** The term's edited points for a code, or null to fall back to DEFAULT_POINT_VALUES. */
  getPointRulePoints(termId: string, code: PointRuleCode): Promise<number | null>;
  isReportFiled(parentType: InitiativeKind, parentId: string): Promise<boolean>;
  setParticipation(row: Participation): Promise<void>;
  deleteParticipation(id: string): Promise<void>;
  getConfirmedRows(memberId: string, termId: string): Promise<AggregateRow[]>;
  getRowsByParent(parentId: string): Promise<Participation[]>;
  setMemberAggregate(memberId: string, termId: string, aggregate: MemberAggregate): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test (fake store)**

`process.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { Participation } from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { ActivityRef } from "./derive.js";
import type { MemberAggregate } from "./aggregate.js";
import { processCheckIn, processCheckInDelete, processInitiativeReport } from "./process.js";
import type { CheckIn } from "./check-in.js";

const startAt = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));

class FakeStore implements EngineStore {
  activities = new Map<string, ActivityRef>();
  rules = new Map<string, number>(); // `${termId}__${code}`
  reports = new Set<string>(); // parentId with a filed report
  rows = new Map<string, Participation>();
  aggregates = new Map<string, MemberAggregate>(); // `${memberId}__${termId}`

  async getActivity(id: string) {
    return this.activities.get(id) ?? null;
  }
  async getPointRulePoints(termId: string, code: string) {
    return this.rules.get(`${termId}__${code}`) ?? null;
  }
  async isReportFiled(_t: string, parentId: string) {
    return this.reports.has(parentId);
  }
  async setParticipation(row: Participation) {
    this.rows.set(row.id, row);
  }
  async deleteParticipation(id: string) {
    this.rows.delete(id);
  }
  async getConfirmedRows(memberId: string, termId: string) {
    return [...this.rows.values()]
      .filter((r) => r.memberId === memberId && r.termId === termId && r.state === "confirmed")
      .map((r) => ({ computedPoints: r.computedPoints, monthBucket: r.monthBucket, state: r.state }));
  }
  async getRowsByParent(parentId: string) {
    return [...this.rows.values()].filter((r) => r.parentId === parentId);
  }
  async setMemberAggregate(memberId: string, termId: string, aggregate: MemberAggregate) {
    this.aggregates.set(`${memberId}__${termId}`, aggregate);
  }
}

const activity: ActivityRef = {
  id: "a1",
  termId: "2026",
  category: "ProjectExecution",
  parentType: "Project",
  parentId: "p1",
  startAt,
};
const checkIn: CheckIn = { memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: startAt };

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  store.activities.set("a1", activity);
  store.rules.set("2026__AttendActivity", 3);
});

describe("processCheckIn", () => {
  it("writes a provisional row (no report yet) and a zero aggregate", async () => {
    await processCheckIn(store, checkIn);
    const row = store.rows.get("a1__m1__Attendee")!;
    expect(row.state).toBe("provisional");
    expect(row.basePoints).toBe(3);
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });

  it("writes a confirmed row + aggregate when the report is filed", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn);
    expect(store.rows.get("a1__m1__Attendee")!.state).toBe("confirmed");
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("falls back to DEFAULT_POINT_VALUES when the rule doc is absent", async () => {
    store.rules.clear();
    store.reports.add("p1");
    await processCheckIn(store, checkIn);
    expect(store.rows.get("a1__m1__Attendee")!.basePoints).toBe(3); // AttendActivity default
  });

  it("is idempotent — a duplicate check-in overwrites the same row", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn);
    await processCheckIn(store, checkIn);
    expect(store.rows.size).toBe(1);
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("no-ops when the activity is missing", async () => {
    store.activities.clear();
    await processCheckIn(store, checkIn);
    expect(store.rows.size).toBe(0);
  });
});

describe("processInitiativeReport", () => {
  it("confirms the initiative's provisional rows and updates the aggregate", async () => {
    await processCheckIn(store, checkIn); // provisional
    await processInitiativeReport(store, "p1", true);
    expect(store.rows.get("a1__m1__Attendee")!.state).toBe("confirmed");
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("reverts to provisional when a report is unfiled", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn); // confirmed
    await processInitiativeReport(store, "p1", false);
    expect(store.rows.get("a1__m1__Attendee")!.state).toBe("provisional");
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });
});

describe("processCheckInDelete", () => {
  it("removes the row and recomputes", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn);
    await processCheckInDelete(store, checkIn);
    expect(store.rows.size).toBe(0);
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/award-points/process.test.ts`
Expected: FAIL — `process.js` not found.

- [ ] **Step 4: Implement `process.ts`**

```ts
import { DEFAULT_POINT_VALUES, resolvePointRuleCode, type ParticipationState } from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { CheckIn } from "./check-in.js";
import { deriveParticipation } from "./derive.js";
import { participationId } from "./participation-id.js";
import { aggregateFromRows } from "./aggregate.js";

/** Derive + persist the participation row for a check-in, then recompute the member aggregate. */
export async function processCheckIn(store: EngineStore, checkIn: CheckIn): Promise<void> {
  const activity = await store.getActivity(checkIn.activityId);
  if (activity === null) return; // missing activity — nothing to compute

  const code = resolvePointRuleCode({
    role: checkIn.role,
    parentType: activity.parentType,
    category: activity.category,
  });
  if (code === null) return; // no rule applies (e.g. Team on an institutional activity)

  const edited = await store.getPointRulePoints(activity.termId, code);
  const basePoints = edited ?? DEFAULT_POINT_VALUES[code];
  const reportFiled =
    activity.parentType !== null && activity.parentId !== null
      ? await store.isReportFiled(activity.parentType, activity.parentId)
      : true;

  const row = deriveParticipation({ checkIn, activity, basePoints, reportFiled });
  if (row === null) return;
  await store.setParticipation(row);
  await recomputeAggregate(store, checkIn.memberId, activity.termId);
}

/** A check-in was deleted — remove its derived row and recompute. */
export async function processCheckInDelete(store: EngineStore, checkIn: CheckIn): Promise<void> {
  const activity = await store.getActivity(checkIn.activityId);
  await store.deleteParticipation(participationId(checkIn.activityId, checkIn.memberId, checkIn.role));
  if (activity !== null) await recomputeAggregate(store, checkIn.memberId, activity.termId);
}

/** A program/project final report was filed or unfiled — re-confirm its rows. */
export async function processInitiativeReport(
  store: EngineStore,
  parentId: string,
  reportFiled: boolean,
): Promise<void> {
  const rows = await store.getRowsByParent(parentId);
  const affected = new Map<string, string>(); // memberId -> termId
  for (const row of rows) {
    const finalReportFiled = reportFiled;
    const state: ParticipationState =
      row.gates.attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";
    await store.setParticipation({
      ...row,
      gates: { ...row.gates, finalReportFiled },
      state,
    });
    affected.set(row.memberId, row.termId);
  }
  for (const [memberId, termId] of affected) await recomputeAggregate(store, memberId, termId);
}

async function recomputeAggregate(store: EngineStore, memberId: string, termId: string): Promise<void> {
  const rows = await store.getConfirmedRows(memberId, termId);
  await store.setMemberAggregate(memberId, termId, aggregateFromRows(rows));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/award-points/process.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add apps/beacon/src/award-points/store.ts apps/beacon/src/award-points/process.ts apps/beacon/src/award-points/process.test.ts
git commit -m "feat(beacon): engine store port + check-in/report orchestration"
```

---

## Task 7: `firestore-store.ts` (admin-SDK impl) + `index.ts` trigger wiring

**Files:**
- Create: `apps/beacon/src/award-points/firestore-store.ts`
- Modify: `apps/beacon/src/index.ts`
- Modify: `apps/beacon/src/index.test.ts`

The store impl + trigger bindings are impure glue (admin SDK); they are exercised by the optional emulator e2e, not unit-tested (mirrors how the original `awardPoints` trigger was only smoke-checked).

- [ ] **Step 1: Implement `firestore-store.ts`**

```ts
import { getFirestore, type Firestore, type Timestamp } from "firebase-admin/firestore";
import type { PointRuleCode, InitiativeKind, Participation } from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { ActivityRef } from "./derive.js";
import type { AggregateRow, MemberAggregate } from "./aggregate.js";

export function createFirestoreStore(db: Firestore): EngineStore {
  return {
    async getActivity(activityId) {
      const snap = await db.doc(`activities/${activityId}`).get();
      if (!snap.exists) return null;
      const d = snap.data() as Omit<ActivityRef, "id">;
      return {
        id: snap.id,
        termId: d.termId,
        category: d.category,
        parentType: d.parentType,
        parentId: d.parentId,
        startAt: d.startAt as Timestamp,
      };
    },
    async getPointRulePoints(termId, code: PointRuleCode) {
      const snap = await db.doc(`pointRules/${termId}__${code}`).get();
      if (!snap.exists) return null;
      const points = (snap.data() as { points?: unknown }).points;
      return typeof points === "number" ? points : null;
    },
    async isReportFiled(parentType: InitiativeKind, parentId) {
      const collection = parentType === "Program" ? "programs" : "projects";
      const snap = await db.doc(`${collection}/${parentId}`).get();
      return snap.exists && (snap.data() as { finalReport?: unknown }).finalReport != null;
    },
    async setParticipation(row: Participation) {
      const { id, ...data } = row;
      await db.doc(`participations/${id}`).set(data);
    },
    async deleteParticipation(id) {
      await db.doc(`participations/${id}`).delete();
    },
    async getConfirmedRows(memberId, termId): Promise<AggregateRow[]> {
      const snap = await db
        .collection("participations")
        .where("memberId", "==", memberId)
        .where("termId", "==", termId)
        .where("state", "==", "confirmed")
        .get();
      return snap.docs.map((doc) => {
        const d = doc.data() as AggregateRow;
        return { computedPoints: d.computedPoints, monthBucket: d.monthBucket, state: d.state };
      });
    },
    async getRowsByParent(parentId): Promise<Participation[]> {
      const snap = await db.collection("participations").where("parentId", "==", parentId).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Participation, "id">) }));
    },
    async setMemberAggregate(memberId, termId, aggregate: MemberAggregate) {
      await db.doc(`memberPoints/${memberId}`).set({ termId, ...aggregate, updatedAt: new Date() });
      await db.doc(`members/${memberId}`).set({ totalPoints: aggregate.cumulative }, { merge: true });
    },
  };
}
```

- [ ] **Step 2: Rewrite `index.ts`**

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { createFirestoreStore } from "./award-points/firestore-store.js";
import { validateCheckIn } from "./award-points/check-in.js";
import { processCheckIn, processCheckInDelete, processInitiativeReport } from "./award-points/process.js";

function db() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export const awardPoints = onDocumentWritten("checkIns/{id}", async (event) => {
  const store = createFirestoreStore(db());
  const after = event.data?.after;
  if (after?.exists) {
    const checkIn = validateCheckIn(after.data());
    if (checkIn !== null) await processCheckIn(store, checkIn);
    return;
  }
  const before = event.data?.before;
  if (before?.exists) {
    const checkIn = validateCheckIn(before.data());
    if (checkIn !== null) await processCheckInDelete(store, checkIn);
  }
});

function reportTrigger(collection: "programs" | "projects") {
  return onDocumentWritten(`${collection}/{id}`, async (event) => {
    const before = event.data?.before?.data() as { finalReport?: unknown } | undefined;
    const after = event.data?.after?.data() as { finalReport?: unknown } | undefined;
    const wasFiled = before?.finalReport != null;
    const isFiled = after?.finalReport != null;
    if (wasFiled === isFiled) return; // no transition
    const id = event.params.id;
    await processInitiativeReport(createFirestoreStore(db()), id, isFiled);
  });
}

export const confirmOnProgramReport = reportTrigger("programs");
export const confirmOnProjectReport = reportTrigger("projects");

export { setUserRoles } from "./set-user-roles.js";
```

- [ ] **Step 3: Update `index.test.ts`**

Replace the file with export-presence checks (the stale `FUNCTION_NAME`/`buildMemberPointsPath`/nested-path assertions are gone):

```ts
import { describe, expect, it } from "vitest";
import { awardPoints, confirmOnProgramReport, confirmOnProjectReport, setUserRoles } from "./index";

describe("beacon exports", () => {
  it("exports the awardPoints check-in trigger", () => {
    expect(awardPoints).toBeDefined();
  });
  it("exports the report-confirmation triggers", () => {
    expect(confirmOnProgramReport).toBeDefined();
    expect(confirmOnProjectReport).toBeDefined();
  });
  it("re-exports the setUserRoles callable", () => {
    expect(setUserRoles).toBeDefined();
  });
});
```

- [ ] **Step 4: Typecheck + test**

Run: `pnpm --filter beacon exec tsc --noEmit && pnpm --filter beacon exec vitest run`
Expected: PASS (tsc clean; all beacon tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/firestore-store.ts apps/beacon/src/index.ts apps/beacon/src/index.test.ts
git commit -m "feat(beacon): wire checkIns + report triggers; retire stale events trigger"
```

---

## Task 8: `checkIns` firestore rule + rules tests

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Add the failing rules tests**

In `rules.test.ts`, add a describe block (after the `terms` block). The `as()` helper supports extra claims via a third object — check its signature; if it only takes roles, add scannerEventIds by extending the helper. Use this form (extend `as` to accept claims):

```ts
function asClaims(uid: string, claims: Record<string, unknown>) {
  return env.authenticatedContext(uid, claims).firestore();
}

describe("firestore.rules — checkIns", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "checkIns/c1")));
  });
  it("allows Admin to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_admin"), { memberId: "m1", activityId: "a1", role: "Attendee" }),
    );
  });
  it("allows ProjectManager to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_pm"), { memberId: "m1", activityId: "a1", role: "Attendee" }),
    );
  });
  it("allows Scanner to create only for an in-scope activity", async () => {
    const ctx = asClaims("s1", { roles: ["Scanner"], scannerEventIds: ["a1"] });
    await assertSucceeds(setDoc(doc(ctx, "checkIns/c_scan"), { memberId: "m1", activityId: "a1", role: "Attendee" }));
  });
  it("denies Scanner creating for an out-of-scope activity", async () => {
    const ctx = asClaims("s2", { roles: ["Scanner"], scannerEventIds: ["other"] });
    await assertFails(setDoc(doc(ctx, "checkIns/c_bad"), { memberId: "m1", activityId: "a1", role: "Attendee" }));
  });
  it("denies a plain Member from creating", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Member"]), "checkIns/c_m"), { memberId: "m1", activityId: "a1", role: "Attendee" }),
    );
  });
  it("denies update and delete", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "checkIns/c1"), { role: "Director" }));
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c1")));
  });
});
```

Also seed a `checkIns/c1` doc in the `beforeAll` block (for the read/update/delete cases):

```ts
    await setDoc(doc(db, "checkIns/c1"), { memberId: "m1", activityId: "a1", role: "Attendee" });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 GCLOUD_PROJECT=demo-rules-test pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: the `checkIns` create/scoping cases FAIL (collection falls through to deny-all).

- [ ] **Step 3: Add the rule**

In `firestore.rules`, add after the `terms` block:

```
    match /checkIns/{checkInId} {
      allow read: if signedIn();
      allow create: if hasAnyRole(['Admin', 'ProjectManager'])
        || (hasAnyRole(['Scanner'])
            && request.resource.data.activityId in request.auth.token.scannerEventIds);
      allow update, delete: if false;
    }
```

- [ ] **Step 4: Run to verify all pass**

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 GCLOUD_PROJECT=demo-rules-test pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS (all rules tests incl. new `checkIns` cases).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): checkIns — role/scanner-scoped create, immutable, signed-in read"
```

---

## Task 9: Docs + full verification

**Files:**
- Modify: `docs/data-models.md`

- [ ] **Step 1: Update `docs/data-models.md`**

In the `participations/{participationId}` block, add the two denormalized fields:

```typescript
  parentType: 'Program' | 'Project' | null  // denormalized from the activity
  parentId: string | null
```

Add a short `### checkIns/{checkInId}` subsection under the Recognition Engine
section: the engine input (`memberId`, `activityId`, `role`, `checkInAt`),
client-written (Admin/ProjectManager, or Scanner scoped to `scannerEventIds`),
immutable; `awardPoints` derives the `participations` row from it. Note the engine
now runs (checkIns + program/project report triggers) and that `members.totalPoints`
+ `memberPoints` are maintained by beacon.

- [ ] **Step 2: Commit docs**

```bash
git add docs/data-models.md
git commit -m "docs(data-models): checkIns input + Participation parent fields"
```

- [ ] **Step 3: Package + app CI**

Run: `pnpm --filter @luminova/types build && pnpm --filter @luminova/types run ci && pnpm --filter beacon run ci`
Expected: both PASS (types incl. Participation change; beacon incl. all award-points pure + orchestration tests + export checks).

- [ ] **Step 4: Rules tests against the live emulator**

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 GCLOUD_PROJECT=demo-rules-test pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS (incl. `checkIns`).

- [ ] **Step 5: Format + knip + audit**

Run: `pnpm format && pnpm knip && pnpm audit --audit-level=high`
Expected: format clean; knip exit 0 (the new beacon files are reachable via `index.ts` exports; `firestore-store.ts` is reachable via `index.ts`); audit exit 0 (1 moderate pre-existing).

- [ ] **Step 6: Functions review + security review**

Dispatch the `firebase-functions-reviewer` subagent on `apps/beacon` and run `/security-review` on the diff (Cloud Functions + `firestore.rules` touched). Fix any finding ≥ High in-branch.

- [ ] **Step 7: Optional emulator e2e**

With emulators running: seed an `activities/a1` (parented, report unfiled) + `pointRules/2026__AttendActivity`, write a `checkIns` doc → assert a provisional `participations/a1__m1__Attendee` + zero `memberPoints/m1`; set the parent `projects/p1.finalReport` → assert the row flips confirmed + `memberPoints/m1.cumulative` updates.

- [ ] **Step 8: Update memory**

Update `project-luminova-v2.md` with an A2-done entry (checkIns trigger model, store-port orchestration, Participation parent fields, deferred dues/roster/term-window/indexes).

---

## Self-review

**Spec coverage:** checkIns input + trigger (T7) ✓; deterministic row id (T3) ✓; derive code/punctuality/gates/state/monthBucket (T4) ✓; report-confirm trigger + two functions (T6, T7) ✓; full-recompute aggregate + totalPoints mirror (T5, T6, T7) ✓; Participation parent fields (T1) ✓; @luminova/types/engine consumption (T2) ✓; checkIns rules + Scanner scope (T8) ✓; idempotency/validation/no-throw (T3, T6) ✓; docs (T9) ✓; firebase-functions-reviewer + security-review (T9) ✓. Deferred items (dues, roster, term-window cutoff, prod indexes, CheckIn promotion) called out in spec + memory.

**Placeholder scan:** T7 store impl + index wiring are "impure glue, emulator-tested" — that's a deliberate, documented testing boundary (matches the existing untested trigger), with complete code provided, not a placeholder. T8 notes "check the `as()` signature" — that's verifying an existing helper before extending it, with the concrete `asClaims` fallback given. No "TODO"/"TBD".

**Type consistency:** `EngineStore` methods, `ActivityRef`, `AggregateRow`/`MemberAggregate`, `deriveParticipation`/`DeriveInput`, `processCheckIn`/`processCheckInDelete`/`processInitiativeReport`, `participationId`, `validateCheckIn`, `aggregateFromRows` — names/signatures consistent across T3–T7. `Participation` fields match the F3 type + the T1 additions (`parentType`/`parentId`). Export names `awardPoints`/`confirmOnProgramReport`/`confirmOnProjectReport`/`setUserRoles` consistent between T7 index and its test.
```
