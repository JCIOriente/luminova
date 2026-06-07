# A7 — Roster → participation auto-expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The beacon engine derives Director/CoDirector/Team `participation` rows from a program/project roster (no manual check-in tap), confirms them on final-report filing, and voids them when a member leaves the roster.

**Architecture:** Generalize the two `confirmOn*Report` triggers into `onProgramWritten`/`onProjectWritten` calling one idempotent `processInitiativeWrite` that reconciles roster rows + re-confirms attendance rows in a single pass, against the existing `EngineStore` port (no new store methods). A new pure `deriveRosterRow` helper builds the rows; `monthBucket` = report-filed month, identified via `checkInAt === null`.

**Tech Stack:** Firebase Cloud Functions v2 (`firebase-admin`, `firebase-functions`), TypeScript NodeNext, `@luminova/types/engine`, vitest (pure + in-memory fake store; no firebase-admin mocking).

**Key references:**
- Orchestration + fake store: `apps/beacon/src/award-points/process.ts` + `process.test.ts`.
- Pure derive + month bucket: `apps/beacon/src/award-points/derive.ts`.
- Port: `apps/beacon/src/award-points/store.ts`. Impl: `firestore-store.ts`. Triggers: `apps/beacon/src/index.ts`.
- `participationId(activityId, memberId, role)` in `participation-id.ts`. `resolvePointRuleCode` + `DEFAULT_POINT_VALUES` + `Participation` in `@luminova/types/engine`.

**Beacon imports need `.js` extensions (NodeNext). Rebuild dist before any emulator run.**

---

### Task 1: Extract `monthBucketFromMillis`

**Files:**
- Modify: `apps/beacon/src/award-points/derive.ts`
- Test: `apps/beacon/src/award-points/derive.test.ts` (add one case)

- [ ] **Step 1: Add a failing test**

Append to `apps/beacon/src/award-points/derive.test.ts` (it already imports `monthBucketOf` from `./derive.js`; add `monthBucketFromMillis` to that import):

```ts
describe("monthBucketFromMillis", () => {
  it("formats epoch millis as UTC YYYY-MM", () => {
    expect(monthBucketFromMillis(Date.UTC(2026, 5, 6))).toBe("2026-06");
  });
});
```

(Add `monthBucketFromMillis` to the existing `import { ... } from "./derive.js"` line.)

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter beacon exec vitest run src/award-points/derive.test.ts`
Expected: FAIL — `monthBucketFromMillis` is not exported.

- [ ] **Step 3: Refactor `derive.ts`**

Replace the `monthBucketOf` function body with a delegation and export the new helper:

```ts
/** UTC `YYYY-MM` for epoch millis. */
export function monthBucketFromMillis(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** UTC `YYYY-MM` for a Firestore Timestamp. */
export function monthBucketOf(ts: Timestamp): string {
  return monthBucketFromMillis(ts.toMillis());
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter beacon exec vitest run src/award-points/derive.test.ts`
Expected: PASS (existing monthBucketOf tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/derive.ts apps/beacon/src/award-points/derive.test.ts
git commit -m "refactor(beacon): extract monthBucketFromMillis from monthBucketOf"
```

---

### Task 2: `InitiativeWrite` shape in the port module

**Files:**
- Modify: `apps/beacon/src/award-points/store.ts`

- [ ] **Step 1: Add the types**

Append to `apps/beacon/src/award-points/store.ts` (after the `EngineStore` interface). Import `InitiativeKind` is already imported there:

```ts
export type RosterRole = "Director" | "CoDirector" | "Team";

/** The initiative facts the engine needs from a programs/projects write. */
export interface InitiativeWrite {
  termId: string;
  roster: { directorId: string; coDirectorId: string | null; teamIds: string[] };
  reportFiled: boolean;
  filedAtMillis: number | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter beacon exec tsc --noEmit`
Expected: PASS (unused exports are fine; tsc doesn't flag them).

- [ ] **Step 3: Commit**

```bash
git add apps/beacon/src/award-points/store.ts
git commit -m "feat(beacon): InitiativeWrite + RosterRole engine types"
```

---

### Task 3: `deriveRosterRow` + `desiredRosterRoles` (pure, TDD)

**Files:**
- Create: `apps/beacon/src/award-points/derive-roster.ts`
- Test: `apps/beacon/src/award-points/derive-roster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/beacon/src/award-points/derive-roster.test.ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { deriveRosterRow, desiredRosterRoles } from "./derive-roster.js";

const now = Timestamp.fromDate(new Date("2026-03-10T12:00:00Z"));
const filedAtMillis = Date.UTC(2026, 8, 20); // 2026-09

describe("desiredRosterRoles", () => {
  it("maps director, co-director, and each team member", () => {
    expect(
      desiredRosterRoles({ directorId: "m1", coDirectorId: "m2", teamIds: ["m3", "m4"] }),
    ).toEqual([
      { memberId: "m1", role: "Director" },
      { memberId: "m2", role: "CoDirector" },
      { memberId: "m3", role: "Team" },
      { memberId: "m4", role: "Team" },
    ]);
  });
  it("skips a null co-director and an empty team", () => {
    expect(desiredRosterRoles({ directorId: "m1", coDirectorId: null, teamIds: [] })).toEqual([
      { memberId: "m1", role: "Director" },
    ]);
  });
  it("skips an empty-string director", () => {
    expect(desiredRosterRoles({ directorId: "", coDirectorId: null, teamIds: [] })).toEqual([]);
  });
});

describe("deriveRosterRow", () => {
  const base = {
    parentType: "Project" as const,
    parentId: "p1",
    termId: "2026",
    memberId: "m1",
    role: "Director" as const,
    pointRuleCode: "DirectProject" as const,
    basePoints: 10,
    fallbackMonth: "2026-03",
    createdAt: now,
  };

  it("builds a provisional row when the report is not filed", () => {
    const row = deriveRosterRow({ ...base, reportFiled: false, filedAtMillis: null });
    expect(row).toMatchObject({
      id: "p1__m1__Director",
      memberId: "m1",
      termId: "2026",
      activityId: "p1",
      parentType: "Project",
      parentId: "p1",
      role: "Director",
      pointRuleCode: "DirectProject",
      basePoints: 10,
      punctualityFactor: 1,
      computedPoints: 10,
      monthBucket: "2026-03",
      state: "provisional",
      gates: { attendanceRegistered: true, finalReportFiled: false },
      checkInAt: null,
      voidReason: null,
    });
  });

  it("confirms + stamps the report month when filed", () => {
    const row = deriveRosterRow({ ...base, reportFiled: true, filedAtMillis });
    expect(row.state).toBe("confirmed");
    expect(row.gates.finalReportFiled).toBe(true);
    expect(row.monthBucket).toBe("2026-09");
  });

  it("falls back to fallbackMonth if filed but filedAtMillis is null", () => {
    const row = deriveRosterRow({ ...base, reportFiled: true, filedAtMillis: null });
    expect(row.monthBucket).toBe("2026-03");
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter beacon exec vitest run src/award-points/derive-roster.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/beacon/src/award-points/derive-roster.ts
import type { PointRuleCode, InitiativeKind, Participation } from "@luminova/types/engine";
import type { RosterRole, InitiativeWrite } from "./store.js";
import { participationId } from "./participation-id.js";
import { monthBucketFromMillis } from "./derive.js";

/** Flatten a roster into the (member, role) pairs the engine should award. */
export function desiredRosterRoles(
  roster: InitiativeWrite["roster"],
): { memberId: string; role: RosterRole }[] {
  const out: { memberId: string; role: RosterRole }[] = [];
  if (roster.directorId) out.push({ memberId: roster.directorId, role: "Director" });
  if (roster.coDirectorId) out.push({ memberId: roster.coDirectorId, role: "CoDirector" });
  for (const id of roster.teamIds ?? []) {
    if (id) out.push({ memberId: id, role: "Team" });
  }
  return out;
}

export interface DeriveRosterInput {
  parentType: InitiativeKind;
  parentId: string;
  termId: string;
  memberId: string;
  role: RosterRole;
  pointRuleCode: PointRuleCode;
  basePoints: number;
  reportFiled: boolean;
  filedAtMillis: number | null;
  fallbackMonth: string;
  createdAt: Participation["createdAt"];
}

/** Build the roster-derived participation row (no check-in; report-gated). */
export function deriveRosterRow(input: DeriveRosterInput): Participation {
  const finalReportFiled = input.reportFiled;
  const monthBucket =
    finalReportFiled && input.filedAtMillis !== null
      ? monthBucketFromMillis(input.filedAtMillis)
      : input.fallbackMonth;
  return {
    id: participationId(input.parentId, input.memberId, input.role),
    memberId: input.memberId,
    termId: input.termId,
    activityId: input.parentId,
    parentType: input.parentType,
    parentId: input.parentId,
    role: input.role,
    pointRuleCode: input.pointRuleCode,
    basePoints: input.basePoints,
    punctualityFactor: 1,
    computedPoints: input.basePoints,
    monthBucket,
    state: finalReportFiled ? "confirmed" : "provisional",
    gates: { attendanceRegistered: true, finalReportFiled },
    checkInAt: null,
    voidReason: null,
    createdAt: input.createdAt,
  };
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter beacon exec vitest run src/award-points/derive-roster.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/derive-roster.ts apps/beacon/src/award-points/derive-roster.test.ts
git commit -m "feat(beacon): deriveRosterRow + desiredRosterRoles pure helpers"
```

---

### Task 4: `processInitiativeWrite` orchestration (replaces `processInitiativeReport`)

**Files:**
- Modify: `apps/beacon/src/award-points/process.ts`
- Modify: `apps/beacon/src/award-points/process.test.ts`

- [ ] **Step 1: Convert the existing report tests + add roster tests**

In `process.test.ts`: change the import `processInitiativeReport` → `processInitiativeWrite`, and import the `Participation`/`Timestamp` already present. Replace the entire `describe("processInitiativeReport", ...)` block with:

```ts
const projNow = Timestamp.fromDate(new Date("2026-06-10T00:00:00Z"));
function initiative(
  over: Partial<{
    termId: string;
    roster: { directorId: string; coDirectorId: string | null; teamIds: string[] };
    reportFiled: boolean;
    filedAtMillis: number | null;
  }> = {},
) {
  return {
    termId: "2026",
    roster: { directorId: "", coDirectorId: null, teamIds: [] as string[] },
    reportFiled: false,
    filedAtMillis: null,
    ...over,
  };
}

describe("processInitiativeWrite — report confirmation of attendance rows", () => {
  it("confirms the initiative's provisional attendance rows", async () => {
    await processCheckIn(store, checkIn); // provisional attendance row
    await processInitiativeWrite(store, "Project", "p1", initiative({ reportFiled: true }), projNow);
    expect(store.rows.get("a1__m1__Attendee")!.state).toBe("confirmed");
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("reverts attendance rows to provisional when the report is unfiled", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn); // confirmed
    await processInitiativeWrite(store, "Project", "p1", initiative({ reportFiled: false }), projNow);
    expect(store.rows.get("a1__m1__Attendee")!.state).toBe("provisional");
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });
});

describe("processInitiativeWrite — roster expansion", () => {
  beforeEach(() => {
    store.rules.set("2026__DirectProject", 10);
    store.rules.set("2026__CoDirectProject", 6);
    store.rules.set("2026__ProgramProjectTeam", 3);
  });

  it("creates provisional roster rows (no report yet)", async () => {
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ roster: { directorId: "d1", coDirectorId: "c1", teamIds: ["t1", "t2"] } }),
      projNow,
    );
    expect(store.rows.get("p1__d1__Director")!.pointRuleCode).toBe("DirectProject");
    expect(store.rows.get("p1__c1__CoDirector")!.pointRuleCode).toBe("CoDirectProject");
    expect(store.rows.get("p1__t1__Team")!.pointRuleCode).toBe("ProgramProjectTeam");
    expect(store.rows.get("p1__d1__Director")!.state).toBe("provisional");
    expect(store.aggregates.get("d1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });

  it("confirms roster rows + stamps the report month when filed", async () => {
    const filedAtMillis = Date.UTC(2026, 8, 1); // 2026-09
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ roster: { directorId: "d1", coDirectorId: null, teamIds: [] }, reportFiled: true, filedAtMillis }),
      projNow,
    );
    const row = store.rows.get("p1__d1__Director")!;
    expect(row.state).toBe("confirmed");
    expect(row.monthBucket).toBe("2026-09");
    expect(store.aggregates.get("d1__2026")).toEqual({ cumulative: 10, byMonth: { "2026-09": 10 } });
  });

  it("voids a member dropped from the roster + recomputes their aggregate", async () => {
    const filedAtMillis = Date.UTC(2026, 8, 1);
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ roster: { directorId: "d1", coDirectorId: "c1", teamIds: [] }, reportFiled: true, filedAtMillis }),
      projNow,
    );
    expect(store.rows.has("p1__c1__CoDirector")).toBe(true);
    // c1 removed
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ roster: { directorId: "d1", coDirectorId: null, teamIds: [] }, reportFiled: true, filedAtMillis }),
      projNow,
    );
    expect(store.rows.has("p1__c1__CoDirector")).toBe(false);
    expect(store.aggregates.get("c1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });

  it("is idempotent — re-running an unchanged write keeps the same rows + bucket", async () => {
    const filedAtMillis = Date.UTC(2026, 8, 1);
    const init = initiative({ roster: { directorId: "d1", coDirectorId: null, teamIds: [] }, reportFiled: true, filedAtMillis });
    await processInitiativeWrite(store, "Project", "p1", init, projNow);
    const first = { ...store.rows.get("p1__d1__Director")! };
    await processInitiativeWrite(store, "Project", "p1", init, Timestamp.fromDate(new Date("2027-01-01T00:00:00Z")));
    expect(store.rows.size).toBe(1);
    expect(store.rows.get("p1__d1__Director")!.monthBucket).toBe(first.monthBucket);
  });

  it("does not touch a co-existing attendance row's month bucket", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn); // attendance row, monthBucket 2026-06
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ roster: { directorId: "d1", coDirectorId: null, teamIds: [] }, reportFiled: true, filedAtMillis: Date.UTC(2026, 8, 1) }),
      projNow,
    );
    expect(store.rows.get("a1__m1__Attendee")!.monthBucket).toBe("2026-06");
  });
});
```

(Keep the existing `processCheckIn` / `processCheckInDelete` describe blocks unchanged.)

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter beacon exec vitest run src/award-points/process.test.ts`
Expected: FAIL — `processInitiativeWrite` not exported (and `processInitiativeReport` import removed).

- [ ] **Step 3: Implement — replace `processInitiativeReport` in `process.ts`**

Update imports at the top of `process.ts`:

```ts
import {
  DEFAULT_POINT_VALUES,
  resolvePointRuleCode,
  type ParticipationState,
  type PointRuleCode,
} from "@luminova/types/engine";
import type { EngineStore, InitiativeWrite } from "./store.js";
import type { CheckIn } from "./check-in.js";
import { deriveParticipation } from "./derive.js";
import { monthBucketFromMillis } from "./derive.js";
import { participationId } from "./participation-id.js";
import { aggregateFromRows } from "./aggregate.js";
import { deriveRosterRow, desiredRosterRoles } from "./derive-roster.js";
```

Delete the entire `processInitiativeReport` function and replace it with:

```ts
/**
 * Reconcile an initiative write: re-confirm its attendance rows per the report
 * gate, expand its roster into Director/CoDirector/Team rows, and void rows for
 * members no longer on the roster. Idempotent — runs on every programs/projects write.
 */
export async function processInitiativeWrite(
  store: EngineStore,
  parentType: "Program" | "Project",
  parentId: string,
  init: InitiativeWrite,
  now: { toMillis(): number; toDate(): Date },
): Promise<void> {
  const desired = desiredRosterRoles(init.roster);
  const desiredIds = new Set(
    desired.map((d) => participationId(parentId, d.memberId, d.role)),
  );
  const affected = new Map<string, { memberId: string; termId: string }>();
  const touch = (memberId: string, termId: string) =>
    affected.set(`${memberId} ${termId}`, { memberId, termId });

  const rows = await store.getRowsByParent(parentId);

  // 1. Re-confirm attendance rows (checkInAt != null) per the report gate; keep their month.
  for (const row of rows) {
    if (row.checkInAt === null) continue;
    const finalReportFiled = init.reportFiled;
    const state: ParticipationState =
      row.gates.attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";
    if (row.state !== state || row.gates.finalReportFiled !== finalReportFiled) {
      await store.setParticipation({ ...row, gates: { ...row.gates, finalReportFiled }, state });
      touch(row.memberId, row.termId);
    }
  }

  // 2. Void roster rows (checkInAt === null) no longer desired.
  for (const row of rows) {
    if (row.checkInAt !== null) continue;
    if (!desiredIds.has(row.id)) {
      await store.deleteParticipation(row.id);
      touch(row.memberId, row.termId);
    }
  }

  // 3. Upsert each desired roster row.
  for (const { memberId, role } of desired) {
    const code = resolvePointRuleCode({ role, parentType, category: "ProjectExecution" });
    if (code === null) continue; // never for Director/CoDirector/Team with a parent
    const edited = await store.getPointRulePoints(init.termId, code);
    const basePoints = edited ?? DEFAULT_POINT_VALUES[code as PointRuleCode];
    const id = participationId(parentId, memberId, role);
    const existing = await store.getParticipation(id);
    const fallbackMonth = existing?.monthBucket ?? monthBucketFromMillis(now.toMillis());
    const createdAt = existing?.createdAt ?? now;
    await store.setParticipation(
      deriveRosterRow({
        parentType,
        parentId,
        termId: init.termId,
        memberId,
        role,
        pointRuleCode: code,
        basePoints,
        reportFiled: init.reportFiled,
        filedAtMillis: init.filedAtMillis,
        fallbackMonth,
        createdAt,
      }),
    );
    touch(memberId, init.termId);
  }

  // 4. Recompute every affected member's aggregate.
  for (const { memberId, termId } of affected.values()) {
    await recomputeAggregate(store, memberId, termId);
  }
}
```

(The private `recomputeAggregate` at the bottom of `process.ts` stays as-is and is reused.)

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter beacon exec vitest run src/award-points/process.test.ts`
Expected: PASS (existing check-in tests + the new processInitiativeWrite tests).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/process.ts apps/beacon/src/award-points/process.test.ts
git commit -m "feat(beacon): processInitiativeWrite reconciles roster + report (replaces processInitiativeReport)"
```

---

### Task 5: Parse initiative event data → `InitiativeWrite`

**Files:**
- Modify: `apps/beacon/src/award-points/firestore-store.ts`
- Test: `apps/beacon/src/award-points/firestore-store.test.ts` (create — pure parse tests)

- [ ] **Step 1: Write the failing test**

```ts
// apps/beacon/src/award-points/firestore-store.test.ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { parseInitiativeWrite } from "./firestore-store.js";

describe("parseInitiativeWrite", () => {
  it("parses a roster + filed report into millis", () => {
    const filedAt = Timestamp.fromDate(new Date("2026-09-01T00:00:00Z"));
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorId: "c1", teamIds: ["t1"] },
      finalReport: { filedAt, filedBy: "u1" },
    });
    expect(out).toEqual({
      termId: "2026",
      roster: { directorId: "d1", coDirectorId: "c1", teamIds: ["t1"] },
      reportFiled: true,
      filedAtMillis: filedAt.toMillis(),
    });
  });

  it("treats a null finalReport as not filed", () => {
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorId: null, teamIds: [] },
      finalReport: null,
    });
    expect(out?.reportFiled).toBe(false);
    expect(out?.filedAtMillis).toBeNull();
  });

  it("returns null when termId is missing", () => {
    expect(
      parseInitiativeWrite({ roster: { directorId: "d1", coDirectorId: null, teamIds: [] } }),
    ).toBeNull();
  });

  it("defaults a missing roster to empty (so deletes still reconcile)", () => {
    const out = parseInitiativeWrite({ termId: "2026" });
    expect(out?.roster).toEqual({ directorId: "", coDirectorId: null, teamIds: [] });
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter beacon exec vitest run src/award-points/firestore-store.test.ts`
Expected: FAIL — `parseInitiativeWrite` not exported.

- [ ] **Step 3: Implement in `firestore-store.ts`**

Add to the imports (top of file) — `InitiativeWrite` from the port:

```ts
import type { EngineStore, InitiativeWrite } from "./store.js";
```

(There is already `import type { EngineStore } from "./store.js";` — replace it with the line above.)

Add this exported function (near `parseActivity`):

```ts
/** Parse a programs/projects doc into the engine's InitiativeWrite, or null if termId is malformed. */
export function parseInitiativeWrite(data: Record<string, unknown>): InitiativeWrite | null {
  const termId = data.termId;
  if (typeof termId !== "string" || termId.length === 0) return null;

  const r = (data.roster ?? {}) as Record<string, unknown>;
  const directorId = typeof r.directorId === "string" ? r.directorId : "";
  const coDirectorId = typeof r.coDirectorId === "string" ? r.coDirectorId : null;
  const teamIds = Array.isArray(r.teamIds) ? r.teamIds.filter((x): x is string => typeof x === "string") : [];

  const finalReport = data.finalReport as { filedAt?: unknown } | null | undefined;
  const reportFiled = finalReport != null;
  const filedAtMillis = reportFiled && hasToMillis(finalReport!.filedAt) ? finalReport!.filedAt.toMillis() : null;

  return { termId, roster: { directorId, coDirectorId, teamIds }, reportFiled, filedAtMillis };
}
```

(`hasToMillis` already exists in this file and narrows to `Timestamp`.)

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter beacon exec vitest run src/award-points/firestore-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/award-points/firestore-store.ts apps/beacon/src/award-points/firestore-store.test.ts
git commit -m "feat(beacon): parseInitiativeWrite for the initiative trigger"
```

---

### Task 6: Wire the triggers

**Files:**
- Modify: `apps/beacon/src/index.ts`

- [ ] **Step 1: Replace the report trigger with the initiative trigger**

In `apps/beacon/src/index.ts`:

Update imports:
```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { createFirestoreStore, parseInitiativeWrite } from "./award-points/firestore-store.js";
import { validateCheckIn } from "./award-points/check-in.js";
import { processCheckIn, processCheckInDelete, processInitiativeWrite } from "./award-points/process.js";
```

Replace the `reportTrigger` function and its two exports with:

```ts
function initiativeTrigger(collection: "programs" | "projects") {
  const parentType = collection === "programs" ? "Program" : "Project";
  return onDocumentWritten(`${collection}/{id}`, async (event) => {
    const store = createFirestoreStore(db());
    const now = Timestamp.now();
    const after = event.data?.after;
    if (after?.exists) {
      const init = parseInitiativeWrite(after.data() as Record<string, unknown>);
      if (init !== null) await processInitiativeWrite(store, parentType, event.params.id, init, now);
      return;
    }
    // Initiative deleted — reconcile to an empty roster so its rows are voided.
    const before = event.data?.before;
    if (before?.exists) {
      const prev = parseInitiativeWrite(before.data() as Record<string, unknown>);
      if (prev !== null) {
        await processInitiativeWrite(
          store,
          parentType,
          event.params.id,
          { ...prev, roster: { directorId: "", coDirectorId: null, teamIds: [] }, reportFiled: false, filedAtMillis: null },
          now,
        );
      }
    }
  });
}

export const onProgramWritten = initiativeTrigger("programs");
export const onProjectWritten = initiativeTrigger("projects");
```

(Remove the old `confirmOnProgramReport` / `confirmOnProjectReport` exports + the `reportTrigger` function.)

- [ ] **Step 2: Typecheck + full beacon test run**

Run: `pnpm --filter beacon exec tsc --noEmit`
Run: `pnpm --filter beacon exec vitest run`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/beacon/src/index.ts
git commit -m "feat(beacon): onProgramWritten/onProjectWritten triggers drive roster expansion"
```

---

### Task 7: Verification, review, PR

**Files:** none.

- [ ] **Step 1: Beacon CI + types CI**

Run: `pnpm --filter @luminova/types run ci && pnpm --filter beacon run ci`
Expected: PASS. (types is untouched — A7 reuses existing engine exports; run it to be safe.)

- [ ] **Step 2: Rebuild dist (emulator correctness note)**

Run: `pnpm --filter beacon build`
Expected: emits `dist/`. (The functions emulator runs stale dist otherwise — known gotcha; required before any emulator e2e.)

- [ ] **Step 3: format + knip**

Run: `pnpm exec prettier --check "apps/beacon/src/**/*.ts"` and `pnpm knip`
Expected: clean. (`InitiativeWrite`/`RosterRole`/`deriveRosterRow`/`desiredRosterRoles`/`parseInitiativeWrite` are all consumed by process/firestore-store/index.)

- [ ] **Step 4: firebase-functions-reviewer**

Dispatch `firebase-functions-reviewer` on the `apps/beacon` change: the renamed `onProgramWritten`/`onProjectWritten` triggers + `processInitiativeWrite` + `parseInitiativeWrite`. Confirm: admin-SDK-only, idempotency, input validation on the parsed initiative data, no client SDK, error handling. Fix any Critical/High in-branch. No `/security-review` trigger (no rules/auth/secret change — participations stay `write:false`, engine writes via admin SDK).

- [ ] **Step 5: Optional emulator e2e**

If not too heavyweight: extend a `tools/scripts/` harness to write a `projects/{id}` doc with a roster (admin SDK), assert 3 `participations` appear (provisional), set `finalReport`, assert they flip to confirmed + `memberPoints` reflects the director's points. Otherwise note in the status doc that the fake-store orchestration tests cover the logic and e2e is deferred. Do NOT block the PR on this.

- [ ] **Step 6: Push + PR**

```bash
git push -u origin feat/roster-expansion
gh pr create --title "feat(beacon): A7 roster → participation auto-expansion" --body "$(cat <<'EOF'
## Summary
- The engine derives Director/CoDirector/Team `participation` rows from a program/project **roster** (no manual check-in tap), confirms them on final-report filing (`monthBucket` = report month), and **voids** them when a member leaves the roster.
- Generalized `confirmOn*Report` → `onProgramWritten`/`onProjectWritten` calling one idempotent `processInitiativeWrite` (reconciles roster rows + re-confirms attendance rows in one pass). New pure `deriveRosterRow`. No new `EngineStore` methods.
- Closes the v1 trust-model gap (#7) — initiative roles now come from the authoritative roster, not the checkIn fact.
- No `firestore.rules` change (`participations` stay `write:false`; engine writes via admin SDK).

## Test plan
- [ ] types-ci + beacon-ci pass
- [ ] firebase-functions-reviewer run
- [ ] /security-review N/A (no rules/auth/secret change)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

- **Spec coverage:** monthBucketFromMillis (T1) ✓; InitiativeWrite/RosterRole (T2) ✓; deriveRosterRow + desiredRosterRoles + report-month logic (T3) ✓; processInitiativeWrite reconcile incl. attendance re-confirm + roster upsert + void + idempotency (T4) ✓; parseInitiativeWrite (T5) ✓; renamed triggers + delete-reconcile (T6) ✓; CI + functions-reviewer + optional e2e + PR (T7) ✓. monthBucket=report-month, checkInAt===null discriminator, Director+CoDirector+Team expansion — all covered. No rules change ✓.
- **Type consistency:** `InitiativeWrite`/`RosterRole` defined in `store.ts` (T2), consumed by `derive-roster.ts` (T3), `process.ts` (T4), `firestore-store.ts` (T5). `deriveRosterRow`/`desiredRosterRoles` (T3) ↔ `process.ts` (T4). `parseInitiativeWrite` (T5) ↔ `index.ts` (T6). `processInitiativeWrite(store, parentType, parentId, init, now)` signature identical across T4/T6. `monthBucketFromMillis` (T1) used in T3 + T4. `now` is a `{toMillis;toDate}` (Participation.createdAt's SDK-neutral Timestamp) — admin `Timestamp.now()` satisfies it (T6), fake passes `Timestamp.fromDate` (T4).
- **Placeholders:** none — full code in every step.
- **Idempotency:** T4 preserves `fallbackMonth`/`createdAt` from the existing row; the idempotent test (re-run with a different `now`) guards the bucket from drifting. Verified in the test set.
