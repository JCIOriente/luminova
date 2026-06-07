import { describe, expect, it } from "vitest";
import { applyChips, applySearch, applySort } from "./data-table";

interface Row {
  id: string;
  name: string;
  status: string;
  points: number;
}

const rows: Row[] = [
  { id: "a", name: "Ana", status: "Activo", points: 30 },
  { id: "b", name: "Beto", status: "Inactivo", points: 10 },
  { id: "c", name: "Carla", status: "Activo", points: 20 },
];

const searchText = (r: Row) => `${r.name} ${r.status}`;

describe("applySearch", () => {
  it("returns all rows when the query is empty or whitespace", () => {
    expect(applySearch(rows, "  ", searchText)).toHaveLength(3);
  });

  it("filters case-insensitively by the search text", () => {
    expect(applySearch(rows, "ana", searchText).map((r) => r.id)).toEqual(["a"]);
  });

  it("matches across the whole search text, not just the name", () => {
    expect(applySearch(rows, "inactivo", searchText).map((r) => r.id)).toEqual(["b"]);
  });

  it("returns every row when no searchText accessor is given", () => {
    expect(applySearch(rows, "ana", undefined)).toHaveLength(3);
  });
});

describe("applyChips", () => {
  const predicate = (row: Row, ids: string[]) => ids.includes(row.status);

  it("returns all rows when no chips are active", () => {
    expect(applyChips(rows, [], predicate)).toHaveLength(3);
  });

  it("keeps only rows matching an active chip", () => {
    expect(applyChips(rows, ["Activo"], predicate).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("returns all rows when no predicate is provided", () => {
    expect(applyChips(rows, ["Activo"], undefined)).toHaveLength(3);
  });
});

describe("applySort", () => {
  const columns = [{ id: "points", sortValue: (r: Row) => r.points }];

  it("returns rows unchanged when dir is null", () => {
    expect(applySort(rows, { columnId: "points", dir: null }, columns).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("sorts ascending by the column sortValue", () => {
    expect(applySort(rows, { columnId: "points", dir: "asc" }, columns).map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("sorts descending by the column sortValue", () => {
    expect(applySort(rows, { columnId: "points", dir: "desc" }, columns).map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("sorts strings with locale comparison", () => {
    const nameCols = [{ id: "name", sortValue: (r: Row) => r.name }];
    expect(applySort(rows, { columnId: "name", dir: "asc" }, nameCols).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("returns rows unchanged when the column has no sortValue", () => {
    expect(applySort(rows, { columnId: "name", dir: "asc" }, columns).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    applySort(rows, { columnId: "points", dir: "asc" }, columns);
    expect(rows).toEqual(copy);
  });
});
