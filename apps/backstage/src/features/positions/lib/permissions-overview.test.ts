import { describe, expect, it } from "vitest";
import type { Member, Position } from "@luminova/types";
import { buildPermissionsOverview, MANAGED_ROLES } from "./permissions-overview";

const pres = {
  id: "p1",
  title: "Presidente",
  category: "CEL",
  grants: ["Admin"],
  term: null,
  active: true,
  deletedAt: null,
  titleFemale: null,
  sigla: null,
  description: "",
} as unknown as Position;
const tes = {
  id: "p2",
  title: "Tesorero",
  category: "CEL",
  grants: ["Treasury"],
  term: null,
  active: true,
  deletedAt: null,
  titleFemale: null,
  sigla: null,
  description: "",
} as unknown as Position;
const olivia = {
  id: "m0",
  name: "Olivia",
  positions: { "2026": { cargoId: "p1", comisionIds: [], assignedBy: "m0" } },
} as unknown as Member;

describe("buildPermissionsOverview", () => {
  const rows = buildPermissionsOverview([pres, tes], [olivia], "2026");
  it("covers the managed roles", () => {
    expect(rows.map((r) => r.role)).toEqual(MANAGED_ROLES);
  });
  it("lists the cargo that grants Admin", () => {
    expect(rows.find((r) => r.role === "Admin")!.grantingCargos).toEqual(["Presidente"]);
  });
  it("lists Olivia as an Admin holder", () => {
    expect(rows.find((r) => r.role === "Admin")!.holders).toEqual([{ id: "m0", name: "Olivia" }]);
  });
  it("shows Treasury granted-by but held by nobody", () => {
    const t = rows.find((r) => r.role === "Treasury")!;
    expect(t.grantingCargos).toEqual(["Tesorero"]);
    expect(t.holders).toEqual([]);
  });
});
