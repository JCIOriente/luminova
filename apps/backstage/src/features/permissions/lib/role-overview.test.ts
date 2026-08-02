import { describe, expect, it } from "vitest";
import type { Member, Position, RoleDefinition } from "@luminova/types";
import { buildRoleOverview } from "./role-overview";

const builtInDoc: RoleDefinition = {
  id: "Admin",
  name: "Administrador",
  description: "Acceso total.",
  builtIn: true,
  builtInKey: "Admin",
  permissions: ["manage:all"],
  locked: true,
  active: true,
  deletedAt: null,
};

const customDoc: RoleDefinition = {
  id: "custom-1",
  name: "Auditoría",
  description: "Revisa las cuentas.",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
};

const presidente = {
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

const olivia = {
  id: "m0",
  name: "Olivia",
  positions: { "2026": { cargoId: "p1", comisionIds: [], assignedBy: "m0" } },
} as unknown as Member;

describe("buildRoleOverview", () => {
  it("lists the cargos that grant a built-in role", () => {
    const rows = buildRoleOverview([builtInDoc], [presidente], [], "2026");
    expect(rows.map((row) => row.grantingCargos)).toEqual([["Presidente"]]);
  });

  it("never attributes a cargo to a custom role", () => {
    // positions.grants is z.enum(ROLES) — a custom role's doc id can never appear in it.
    const rows = buildRoleOverview([customDoc], [presidente], [], "2026");
    expect(rows.map((row) => row.grantingCargos)).toEqual([[]]);
  });

  it("counts cargo-derived holders for a built-in role", () => {
    const rows = buildRoleOverview([builtInDoc], [presidente], [olivia], "2026");
    expect(rows.map((row) => row.holders)).toEqual([[{ id: "m0", name: "Olivia" }]]);
  });

  it("counts roleIds holders for a custom role", () => {
    // The old buildPermissionsOverview read only positions[term].cargoId, so every custom
    // role reported "Nadie aún" even when it had holders.
    const member = {
      id: "m1",
      name: "Bruno",
      roleIds: ["custom-1"],
      positions: {},
    } as unknown as Member;
    const rows = buildRoleOverview([customDoc], [], [member], "2026");
    expect(rows.map((row) => row.holders)).toEqual([[{ id: "m1", name: "Bruno" }]]);
  });

  it("ignores inactive cargos", () => {
    const rows = buildRoleOverview([builtInDoc], [{ ...presidente, active: false }], [], "2026");
    expect(rows.map((row) => row.grantingCargos)).toEqual([[]]);
  });
});
