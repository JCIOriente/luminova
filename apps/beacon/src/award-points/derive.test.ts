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
    const row = deriveParticipation({
      checkIn: checkIn(),
      activity: activity(),
      basePoints: 3,
      reportFiled: true,
    });
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
    const row = deriveParticipation({
      checkIn: checkIn(),
      activity: activity(),
      basePoints: 3,
      reportFiled: false,
    });
    expect(row?.state).toBe("provisional");
    expect(row?.gates.finalReportFiled).toBe(false);
  });

  it("confirms an institutional activity with no parent (report gate N/A)", () => {
    const row = deriveParticipation({
      checkIn: checkIn(),
      activity: activity({ category: "Assembly", parentType: null, parentId: null }),
      basePoints: 4,
      reportFiled: false,
    });
    expect(row?.pointRuleCode).toBe("AttendAssembly");
    expect(row?.state).toBe("confirmed");
    expect(row?.gates.finalReportFiled).toBe(true);
  });

  it("halves points for a late attendee", () => {
    const late = Timestamp.fromDate(new Date("2026-06-06T18:30:00Z"));
    const row = deriveParticipation({
      checkIn: checkIn({ checkInAt: late }),
      activity: activity({ category: "Assembly", parentType: null, parentId: null }),
      basePoints: 4,
      reportFiled: true,
    });
    expect(row?.punctualityFactor).toBe(0.5);
    expect(row?.computedPoints).toBe(2);
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
