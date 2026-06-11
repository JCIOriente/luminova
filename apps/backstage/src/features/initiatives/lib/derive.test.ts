import { describe, expect, it } from "vitest";
import type { Activity } from "@luminova/types";
import {
  areaTone,
  childActivitiesOf,
  computeProgress,
  formatMonthYear,
  isClosingSoon,
  statusLabel,
  statusTone,
} from "./derive";
import type { InitiativeListItem } from "./initiative-list-item";

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Activity["startAt"];

function activity(parentId: string, status: Activity["status"]): Activity {
  return {
    id: `a-${Math.random()}`,
    termId: "2026",
    title: "x",
    description: null,
    category: "ProjectExecution",
    parentType: "Project",
    parentId,
    organizers: { directorId: null, coDirectorIds: [] },
    startAt: ts(0),
    endAt: null,
    photos: [],
    status,
  } as Activity;
}

const baseItem = (over: Partial<InitiativeListItem> = {}): InitiativeListItem =>
  ({
    id: "p1",
    kind: "Project",
    termId: "2026",
    title: "Proyecto",
    description: "desc",
    category: "DesarrolloComunitario",
    startDate: ts(0),
    endDate: ts(0),
    roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
    photos: [],
    impact: null,
    finalReport: null,
    status: "EnEjecucion",
    directionUids: [],
    ...over,
  }) as InitiativeListItem;

describe("computeProgress", () => {
  it("is Ejecutada / (total - Cancelada)", () => {
    const acts = [
      activity("p1", "Ejecutada"),
      activity("p1", "Ejecutada"),
      activity("p1", "Programada"),
      activity("p1", "Cancelada"),
      activity("other", "Ejecutada"),
    ];
    expect(computeProgress(acts, "p1")).toEqual({ executed: 2, total: 3, pending: 1, pct: 67 });
  });

  it("is 0% when no countable activities", () => {
    expect(computeProgress([activity("p1", "Cancelada")], "p1")).toEqual({
      executed: 0,
      total: 0,
      pending: 0,
      pct: 0,
    });
  });
});

describe("isClosingSoon", () => {
  const DAY = 86_400_000;
  it("flags an in-execution initiative whose endDate is within 30 days", () => {
    const item = baseItem({ endDate: ts(20 * DAY) });
    expect(isClosingSoon(item, [activity("p1", "Programada")], 0)).toBe(true);
  });
  it("flags an in-execution initiative whose activities are all executed", () => {
    const item = baseItem({ endDate: ts(999 * DAY) });
    const acts = [activity("p1", "Ejecutada"), activity("p1", "Cancelada")];
    expect(isClosingSoon(item, acts, 0)).toBe(true);
  });
  it("does not flag when far out with pending activities", () => {
    const item = baseItem({ endDate: ts(999 * DAY) });
    expect(isClosingSoon(item, [activity("p1", "Programada")], 0)).toBe(false);
  });
  it("does not flag non-in-execution initiatives", () => {
    const item = baseItem({ status: "Planificacion", endDate: ts(0) });
    expect(isClosingSoon(item, [], 0)).toBe(false);
  });
  it("does not flag an in-execution initiative with zero activities by the all-done branch", () => {
    const item = baseItem({ endDate: ts(999 * DAY) });
    expect(isClosingSoon(item, [], 0)).toBe(false);
  });
});

describe("statusLabel / statusTone", () => {
  it("maps statuses", () => {
    expect(statusLabel("Planificacion")).toBe("Planificación");
    expect(statusLabel("EnEjecucion")).toBe("En curso");
    expect(statusLabel("Finalizado")).toBe("Completado");
    expect(statusTone("EnEjecucion")).toBe("blue");
    expect(statusTone("Finalizado")).toBe("green");
    expect(statusTone("Planificacion")).toBe("gray");
  });
});

describe("areaTone", () => {
  it("maps every area to a brand tone", () => {
    expect(areaTone("DesarrolloIndividual")).toBe("blue");
    expect(areaTone("DesarrolloComunitario")).toBe("teal");
    expect(areaTone("NegociosEmprendimiento")).toBe("amber");
    expect(areaTone("CooperacionInternacional")).toBe("navy");
  });
});

describe("formatMonthYear", () => {
  it("formats a timestamp as capitalized es month + year", () => {
    expect(formatMonthYear(ts(Date.UTC(2026, 7, 15)))).toMatch(/^[A-ZÁÉÍÓÚ]\w+\.? 2026$/);
  });
});

describe("computeProgress pending", () => {
  it("reports pending = total - executed (excludes Cancelada)", () => {
    const acts = [
      { id: "a", parentId: "p1", parentType: "Project", status: "Ejecutada" },
      { id: "b", parentId: "p1", parentType: "Project", status: "Programada" },
      { id: "c", parentId: "p1", parentType: "Project", status: "Cancelada" },
    ] as unknown as import("@luminova/types").Activity[];
    expect(computeProgress(acts, "p1")).toMatchObject({
      executed: 1,
      total: 2,
      pending: 1,
      pct: 50,
    });
  });
});

describe("childActivitiesOf", () => {
  it("matches parentId AND parentType", () => {
    const acts = [
      { id: "a", parentId: "p1", parentType: "Project", startAt: { toMillis: () => 0 } },
      { id: "b", parentId: "p1", parentType: "Program", startAt: { toMillis: () => 0 } },
      { id: "c", parentId: "p2", parentType: "Project", startAt: { toMillis: () => 0 } },
    ] as unknown as import("@luminova/types").Activity[];
    expect(childActivitiesOf(acts, "Project", "p1").map((a) => a.id)).toEqual(["a"]);
  });
});
