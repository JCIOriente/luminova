import { describe, expect, it } from "vitest";
import type { InitiativeKind, Participation, Timestamp } from "@luminova/types";
import { summarizeParticipations } from "./participation-summary";

const ts: Timestamp = { toMillis: () => 0, toDate: () => new Date(0) };

function participation(overrides: Partial<Participation>): Participation {
  return {
    id: "p1",
    memberId: "m1",
    termId: "2026",
    activityId: "a1",
    parentType: null,
    parentId: null,
    role: "Attendee",
    pointRuleCode: "AttendActivity",
    basePoints: 1,
    punctualityFactor: 1,
    computedPoints: 1,
    monthBucket: "2026-01",
    state: "confirmed",
    gates: { attendanceRegistered: true, finalReportFiled: false },
    checkInAt: null,
    voidReason: null,
    createdAt: ts,
    ...overrides,
  };
}

const activities = [
  { id: "a1", title: "Taller de liderazgo" },
  { id: "a2", title: "Jornada de limpieza" },
  { id: "a3", title: "Reunión mensual" },
];

const initiatives: { id: string; title: string; kind: InitiativeKind }[] = [
  { id: "prog1", title: "Crecimiento JCI", kind: "Program" },
  { id: "proj1", title: "Río limpio", kind: "Project" },
];

describe("summarizeParticipations", () => {
  it("resolves activity and parent titles onto each row", () => {
    const rows = [
      participation({ id: "p1", activityId: "a1", parentId: "prog1", parentType: "Program" }),
      participation({ id: "p2", activityId: "a2", parentId: "proj1", parentType: "Project" }),
    ];

    const { rows: enriched } = summarizeParticipations(rows, activities, initiatives);

    expect(enriched[0]?.activityTitle).toBe("Taller de liderazgo");
    expect(enriched[0]?.parentTitle).toBe("Crecimiento JCI");
    expect(enriched[1]?.activityTitle).toBe("Jornada de limpieza");
    expect(enriched[1]?.parentTitle).toBe("Río limpio");
  });

  it("falls back to null when an activity or parent is unavailable", () => {
    const rows = [participation({ activityId: "missing", parentId: "missing" })];

    const { rows: enriched } = summarizeParticipations(rows, activities, initiatives);

    expect(enriched[0]?.activityTitle).toBeNull();
    expect(enriched[0]?.parentTitle).toBeNull();
  });

  it("counts distinct activities", () => {
    const rows = [
      participation({ id: "p1", activityId: "a1" }),
      participation({ id: "p2", activityId: "a1" }),
      participation({ id: "p3", activityId: "a2" }),
    ];

    const { activityCount } = summarizeParticipations(rows, activities, initiatives);

    expect(activityCount).toBe(2);
  });

  it("groups distinct projects with per-project distinct activity counts", () => {
    const rows = [
      participation({ id: "p1", activityId: "a1", parentId: "proj1" }),
      participation({ id: "p2", activityId: "a1", parentId: "proj1" }),
      participation({ id: "p3", activityId: "a2", parentId: "proj1" }),
      participation({ id: "p4", activityId: "a3", parentId: "prog1" }),
    ];

    const { projects } = summarizeParticipations(rows, activities, initiatives);

    expect(projects).toHaveLength(2);
    const rio = projects.find((p) => p.id === "proj1");
    expect(rio?.activityCount).toBe(2);
    expect(rio?.kind).toBe("Project");
    const crecimiento = projects.find((p) => p.id === "prog1");
    expect(crecimiento?.activityCount).toBe(1);
  });

  it("ignores parents that are not in the initiative catalog", () => {
    const rows = [participation({ activityId: "a1", parentId: "ghost" })];

    const { projects } = summarizeParticipations(rows, activities, initiatives);

    expect(projects).toHaveLength(0);
  });
});
