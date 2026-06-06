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
