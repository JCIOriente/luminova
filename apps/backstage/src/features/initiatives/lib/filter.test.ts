import { describe, expect, it } from "vitest";
import { filterInitiatives, tabCounts } from "./filter";
import type { InitiativeListItem } from "./initiative-list-item";

const ts = (ms: number) => ({ toMillis: () => ms }) as InitiativeListItem["endDate"];

const item = (over: Partial<InitiativeListItem>): InitiativeListItem =>
  ({
    id: "x",
    kind: "Project",
    termId: "2026",
    title: "Título",
    description: "d",
    category: "DesarrolloComunitario",
    startDate: ts(0),
    endDate: ts(0),
    roster: { directorId: "m", coDirectorIds: [], teamIds: [] },
    photos: [],
    impact: null,
    finalReport: null,
    status: "EnEjecucion",
    directionUids: [],
    ...over,
  }) as InitiativeListItem;

const data = [
  item({ id: "1", title: "Campaña Río", status: "EnEjecucion", kind: "Project", category: "DesarrolloComunitario" }),
  item({ id: "2", title: "Liderazgo", status: "Planificacion", kind: "Program", category: "DesarrolloIndividual" }),
  item({ id: "3", title: "Feria", status: "Finalizado", kind: "Project", category: "NegociosEmprendimiento" }),
];

describe("filterInitiatives", () => {
  it("tab activos excludes Finalizado", () => {
    const out = filterInitiatives(data, { tab: "activos", kind: "all", area: "all", query: "" });
    expect(out.map((i) => i.id)).toEqual(["1", "2"]);
  });
  it("tab completados keeps only Finalizado", () => {
    const out = filterInitiatives(data, { tab: "completados", kind: "all", area: "all", query: "" });
    expect(out.map((i) => i.id)).toEqual(["3"]);
  });
  it("filters by kind and area", () => {
    const out = filterInitiatives(data, { tab: "todos", kind: "Program", area: "all", query: "" });
    expect(out.map((i) => i.id)).toEqual(["2"]);
  });
  it("search is diacritic- and case-insensitive on title", () => {
    const out = filterInitiatives(data, { tab: "todos", kind: "all", area: "all", query: "rio" });
    expect(out.map((i) => i.id)).toEqual(["1"]);
  });
});

describe("tabCounts", () => {
  it("counts todos / activos / completados", () => {
    expect(tabCounts(data)).toEqual({ todos: 3, activos: 2, completados: 1 });
  });
});
