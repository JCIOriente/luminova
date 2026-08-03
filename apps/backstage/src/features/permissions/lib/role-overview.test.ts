import { describe, expect, it } from "vitest";
import { ROLES, type Member, type Position, type RoleDefinition } from "@luminova/types";
import { buildRoleOverview, type RoleOverviewRow } from "./role-overview";

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

// id collides with a ROLES key on purpose: a row builder that matched on doc.id instead
// of builtInKey would attribute Presidente's `grants: ["Admin"]` to this custom role.
const customDoc: RoleDefinition = {
  id: "Admin",
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

function rowFor(rows: RoleOverviewRow[], id: string): RoleOverviewRow {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`no row for ${id} (got ${rows.map((r) => r.id).join(", ")})`);
  return row;
}

/** Seeded docs come before the synthesized unsynced rows, so the doc under test is first. */
function firstRow(rows: RoleOverviewRow[]): RoleOverviewRow {
  const [row] = rows;
  if (!row) throw new Error("buildRoleOverview returned no rows");
  return row;
}

describe("buildRoleOverview", () => {
  it("lists the cargos that grant a built-in role", () => {
    const rows = buildRoleOverview([builtInDoc], [presidente], [], "2026");
    expect(rowFor(rows, "Admin").grantingCargos).toEqual(["Presidente"]);
  });

  it("never attributes a cargo to a custom role", () => {
    // positions.grants is z.enum(ROLES) — a custom role's doc id can never appear in it,
    // even when that id happens to spell a role name.
    const rows = buildRoleOverview([customDoc], [presidente], [], "2026");
    expect(firstRow(rows).builtInKey).toBeNull();
    expect(firstRow(rows).grantingCargos).toEqual([]);
  });

  it("counts cargo-derived holders for a built-in role", () => {
    const rows = buildRoleOverview([builtInDoc], [presidente], [olivia], "2026");
    expect(rowFor(rows, "Admin").holders).toEqual([{ id: "m0", name: "Olivia" }]);
  });

  it("counts roleIds holders for a custom role", () => {
    // The old buildPermissionsOverview read only positions[term].cargoId, so every custom
    // role reported "Nadie aún" even when it had holders.
    const member = {
      id: "m1",
      name: "Bruno",
      roleIds: ["Admin"],
      positions: {},
    } as unknown as Member;
    const rows = buildRoleOverview([customDoc], [], [member], "2026");
    expect(firstRow(rows).holders).toEqual([{ id: "m1", name: "Bruno" }]);
  });

  it("ignores inactive cargos", () => {
    const rows = buildRoleOverview([builtInDoc], [{ ...presidente, active: false }], [], "2026");
    expect(rowFor(rows, "Admin").grantingCargos).toEqual([]);
  });

  describe("display text", () => {
    it("resolves a built-in row's description from the snapshot when the doc is blank", () => {
      // Production built-in docs carry description: "" (seeding is create()-only and
      // backfills nothing). Rendering the doc raw left every built-in row blank on
      // /permisos while the member panel showed the snapshot text — same role, two answers.
      const rows = buildRoleOverview(
        [{ ...builtInDoc, description: "" }],
        [presidente],
        [],
        "2026",
      );
      expect(rowFor(rows, "Admin").description).toBe("Acceso total a la plataforma.");
    });

    it("prefers a renamed built-in doc over the snapshot", () => {
      const rows = buildRoleOverview(
        [{ ...builtInDoc, name: "Administración General" }],
        [],
        [],
        "2026",
      );
      expect(rowFor(rows, "Admin").label).toBe("Administración General");
    });

    it("uses a custom role's own name and description", () => {
      const rows = buildRoleOverview([customDoc], [], [], "2026");
      expect(firstRow(rows).label).toBe("Auditoría");
      expect(firstRow(rows).description).toBe("Revisa las cuentas.");
    });
  });

  describe("built-in roles with no seeded doc", () => {
    it("emits a row for every ROLES key when nothing is seeded", () => {
      const rows = buildRoleOverview([], [], [], "2026");
      expect(rows.map((row) => row.id)).toEqual([...ROLES]);
      expect(rows.every((row) => row.role === null)).toBe(true);
    });

    it("labels an unsynced row from the snapshot and carries the perms it mints", () => {
      // Not hypothetical: a new ROLES key is offered as a cargo grant and mints perms via
      // beacon's BUILT_IN_ROLE_PERMS fallback long before anyone runs seedRoles.
      const rows = buildRoleOverview([], [], [], "2026");
      const projectManager = rowFor(rows, "ProjectManager");
      expect(projectManager.label).toBe("Proyectos");
      expect(projectManager.description).toBe(
        "Gestionar proyectos, programas y actividades; registrar asistencia.",
      );
      expect(projectManager.permissions).toContain("manage:Project");
    });

    it("still reports the cargos and holders of an unsynced role", () => {
      const rows = buildRoleOverview([], [presidente], [olivia], "2026");
      const admin = rowFor(rows, "Admin");
      expect(admin.role).toBeNull();
      expect(admin.grantingCargos).toEqual(["Presidente"]);
      expect(admin.holders).toEqual([{ id: "m0", name: "Olivia" }]);
    });

    it("does not duplicate a key that already has a seeded doc", () => {
      const rows = buildRoleOverview([builtInDoc], [], [], "2026");
      expect(rows.filter((row) => row.id === "Admin")).toHaveLength(1);
      expect(rowFor(rows, "Admin").role).toBe(builtInDoc);
      expect(rows).toHaveLength(ROLES.length);
    });
  });

  describe("holders union both assignment paths", () => {
    it("counts a built-in role assigned directly through members.roleIds", () => {
      // beacon's getRolesByIds resolves a built-in doc id, so roleIds: ["Admin"] genuinely
      // mints manage:all — a cargo-only holder list would render that Admin invisible.
      const bruno = {
        id: "m1",
        name: "Bruno",
        roleIds: ["Admin"],
        positions: {},
      } as unknown as Member;
      const rows = buildRoleOverview([builtInDoc], [presidente], [bruno], "2026");
      expect(rowFor(rows, "Admin").holders).toEqual([{ id: "m1", name: "Bruno" }]);
    });

    it("counts a member holding a role by both paths exactly once", () => {
      const both = { ...olivia, roleIds: ["Admin"] } as unknown as Member;
      const rows = buildRoleOverview([builtInDoc], [presidente], [both], "2026");
      expect(rowFor(rows, "Admin").holders).toEqual([{ id: "m0", name: "Olivia" }]);
    });
  });
});
