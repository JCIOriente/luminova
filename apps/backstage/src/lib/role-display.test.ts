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
    expect(roleDisplay("ProjectManager", []).label).toBe("Proyectos");
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
    expect(roleDisplay("ProjectManager", [custom]).label).toBe("Proyectos");
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

describe("roleOptions and the role lifecycle", () => {
  it("keeps a deactivated built-in's option and marks it in the label", () => {
    // The option must NOT disappear: MultiSelect renders chips by filtering options
    // against the stored value, so dropping it would hide a grant already live on a
    // cargo. But offering "Proyectos" with no marker while its doc is out of service is
    // the ambiguity an Admin authorizes from — so keep the option, kill the ambiguity.
    const options = roleOptions([doc({ active: false })]);
    expect(options.map((o) => o.value)).toEqual([...ROLES]);
    expect(options.find((o) => o.value === "ProjectManager")?.label).toBe(
      "Proyectos (desactivado)",
    );
  });

  it("marks an active:true + deletedAt-set ghost as deactivated too", () => {
    const deletedAt = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];
    const options = roleOptions([doc({ active: true, deletedAt })]);
    expect(options.find((o) => o.value === "ProjectManager")?.label).toBe(
      "Proyectos (desactivado)",
    );
  });

  it("does not mark a role with no seeded doc (the snapshot fallback is live)", () => {
    // No doc means beacon's BUILT_IN_ROLE_PERMS fallback really is minting perms —
    // calling that "desactivado" would be the opposite of the truth.
    expect(roleOptions([]).find((o) => o.value === "ProjectManager")?.label).toBe("Proyectos");
  });

  it("leaves roleDisplay untouched — the name still resolves for a deactivated doc", () => {
    expect(roleDisplay("ProjectManager", [doc({ active: false })]).label).toBe("Proyectos");
  });
});
