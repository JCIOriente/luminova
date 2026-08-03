import { describe, expect, it } from "vitest";
import { ROLES, type RoleDefinition } from "@luminova/types";
import { roleDisplay, roleOptions } from "./role-display";

function doc(over: Partial<RoleDefinition>): RoleDefinition {
  return {
    id: "ProjectManager",
    name: "Proyectos",
    description: "Gestiona proyectos.",
    builtIn: true,
    builtInKey: "ProjectManager",
    permissions: [],
    locked: false,
    active: true,
    deletedAt: null,
    ...over,
  };
}

describe("roleDisplay", () => {
  it("prefers the live doc over the seed snapshot", () => {
    expect(roleDisplay("ProjectManager", [doc({})])).toEqual({
      label: "Proyectos",
      description: "Gestiona proyectos.",
    });
  });

  it("falls back to the snapshot when no doc exists for the key", () => {
    expect(roleDisplay("ProjectManager", []).label).toBe("Director de Proyecto");
  });

  it("falls back to the snapshot when the doc carries an empty description", () => {
    // Seeded docs currently store description: "" — an empty string must not win.
    expect(roleDisplay("ProjectManager", [doc({ description: "" })]).description).toBe(
      "Gestionar proyectos, programas y actividades; registrar asistencia.",
    );
  });

  it("ignores custom role docs when resolving a built-in key", () => {
    // id spells the role key on purpose: an implementation matching on doc.id instead of
    // builtInKey would return "Impostor" here and pass a fixture with a neutral id.
    const custom = doc({
      id: "ProjectManager",
      name: "Impostor",
      builtIn: false,
      builtInKey: null,
    });
    expect(roleDisplay("ProjectManager", [custom]).label).toBe("Director de Proyecto");
  });
});

describe("roleOptions", () => {
  it("returns one option per ROLES entry even with no docs loaded", () => {
    expect(roleOptions(undefined).map((o) => o.value)).toEqual([...ROLES]);
  });

  it("stays total when only one role doc is loaded", () => {
    // The failure mode this pins down: options derived from the doc list. MultiSelect
    // renders chips by filtering options against the stored value, so a doc-derived list
    // would hide a grant already live on a cargo — an Admin would authorize from a
    // display that omits a real power grant.
    expect(roleOptions([doc({})]).map((o) => o.value)).toEqual([...ROLES]);
  });

  it("labels from the live doc where one exists and the snapshot elsewhere", () => {
    const options = roleOptions([doc({})]);
    expect(options.find((o) => o.value === "ProjectManager")?.label).toBe("Proyectos");
    expect(options.find((o) => o.value === "Treasury")?.label).toBe("Tesorería");
  });
});
