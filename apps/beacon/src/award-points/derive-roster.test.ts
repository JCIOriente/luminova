import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { deriveRosterRow, desiredRosterRoles } from "./derive-roster.js";

const now = Timestamp.fromDate(new Date("2026-03-10T12:00:00Z"));
const filedAtMillis = Date.UTC(2026, 8, 20); // 2026-09

describe("desiredRosterRoles", () => {
  it("maps director, co-director, and each team member", () => {
    expect(
      desiredRosterRoles({ directorId: "m1", coDirectorIds: ["m2"], teamIds: ["m3", "m4"] }),
    ).toEqual([
      { memberId: "m1", role: "Director" },
      { memberId: "m2", role: "CoDirector" },
      { memberId: "m3", role: "Team" },
      { memberId: "m4", role: "Team" },
    ]);
  });
  it("expands every co-director", () => {
    const roles = desiredRosterRoles({
      directorId: "m1",
      coDirectorIds: ["m2", "m3"],
      teamIds: ["m4"],
    });
    expect(roles).toEqual([
      { memberId: "m1", role: "Director" },
      { memberId: "m2", role: "CoDirector" },
      { memberId: "m3", role: "CoDirector" },
      { memberId: "m4", role: "Team" },
    ]);
  });
  it("skips an empty co-director list and an empty team", () => {
    expect(desiredRosterRoles({ directorId: "m1", coDirectorIds: [], teamIds: [] })).toEqual([
      { memberId: "m1", role: "Director" },
    ]);
  });
  it("skips an empty-string director", () => {
    expect(desiredRosterRoles({ directorId: "", coDirectorIds: [], teamIds: [] })).toEqual([]);
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
