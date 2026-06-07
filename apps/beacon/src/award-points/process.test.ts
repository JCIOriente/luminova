import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { Participation } from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { ActivityRef } from "./derive.js";
import type { MemberAggregate } from "./aggregate.js";
import { processCheckIn, processCheckInDelete, processInitiativeWrite } from "./process.js";
import type { CheckIn } from "./check-in.js";

const startAt = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));

class FakeStore implements EngineStore {
  activities = new Map<string, ActivityRef>();
  rules = new Map<string, number>();
  reports = new Set<string>();
  rows = new Map<string, Participation>();
  aggregates = new Map<string, MemberAggregate>();

  async getActivity(id: string) {
    return this.activities.get(id) ?? null;
  }
  async getPointRulePoints(termId: string, code: string) {
    return this.rules.get(`${termId}__${code}`) ?? null;
  }
  async isReportFiled(_t: string, parentId: string) {
    return this.reports.has(parentId);
  }
  async getParticipation(id: string) {
    return this.rows.get(id) ?? null;
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
      .map((r) => ({
        computedPoints: r.computedPoints,
        monthBucket: r.monthBucket,
        state: r.state,
      }));
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
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ reportFiled: true }),
      projNow,
    );
    expect(store.rows.get("a1__m1__Attendee")!.state).toBe("confirmed");
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("reverts attendance rows to provisional when the report is unfiled", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn); // confirmed
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({ reportFiled: false }),
      projNow,
    );
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
      initiative({
        roster: { directorId: "d1", coDirectorId: null, teamIds: [] },
        reportFiled: true,
        filedAtMillis,
      }),
      projNow,
    );
    const row = store.rows.get("p1__d1__Director")!;
    expect(row.state).toBe("confirmed");
    expect(row.monthBucket).toBe("2026-09");
    expect(store.aggregates.get("d1__2026")).toEqual({
      cumulative: 10,
      byMonth: { "2026-09": 10 },
    });
  });

  it("voids a member dropped from the roster + recomputes their aggregate", async () => {
    const filedAtMillis = Date.UTC(2026, 8, 1);
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({
        roster: { directorId: "d1", coDirectorId: "c1", teamIds: [] },
        reportFiled: true,
        filedAtMillis,
      }),
      projNow,
    );
    expect(store.rows.has("p1__c1__CoDirector")).toBe(true);
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({
        roster: { directorId: "d1", coDirectorId: null, teamIds: [] },
        reportFiled: true,
        filedAtMillis,
      }),
      projNow,
    );
    expect(store.rows.has("p1__c1__CoDirector")).toBe(false);
    expect(store.aggregates.get("c1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });

  it("is idempotent — re-running an unchanged write keeps the same rows + bucket", async () => {
    const filedAtMillis = Date.UTC(2026, 8, 1);
    const init = initiative({
      roster: { directorId: "d1", coDirectorId: null, teamIds: [] },
      reportFiled: true,
      filedAtMillis,
    });
    await processInitiativeWrite(store, "Project", "p1", init, projNow);
    const firstBucket = store.rows.get("p1__d1__Director")!.monthBucket;
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      init,
      Timestamp.fromDate(new Date("2027-01-01T00:00:00Z")),
    );
    expect(store.rows.size).toBe(1);
    expect(store.rows.get("p1__d1__Director")!.monthBucket).toBe(firstBucket);
  });

  it("does not touch a co-existing attendance row's month bucket", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn); // attendance row, monthBucket 2026-06
    await processInitiativeWrite(
      store,
      "Project",
      "p1",
      initiative({
        roster: { directorId: "d1", coDirectorId: null, teamIds: [] },
        reportFiled: true,
        filedAtMillis: Date.UTC(2026, 8, 1),
      }),
      projNow,
    );
    expect(store.rows.get("a1__m1__Attendee")!.monthBucket).toBe("2026-06");
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

  it("recomputes from the row's termId even if the activity is already gone", async () => {
    store.reports.add("p1");
    await processCheckIn(store, checkIn);
    store.activities.clear(); // activity deleted before the check-in
    await processCheckInDelete(store, checkIn);
    expect(store.rows.size).toBe(0);
    expect(store.aggregates.get("m1__2026")).toEqual({ cumulative: 0, byMonth: {} });
  });
});
