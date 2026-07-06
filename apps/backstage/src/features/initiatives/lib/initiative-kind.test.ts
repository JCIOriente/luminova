import { describe, it, expect } from "vitest";
import { INITIATIVE_CONFIG, INITIATIVE_TYPE, type InitiativeType } from "./initiative-kind";
import { initiativeKeys } from "../hooks/initiative-keys";

const TYPES: InitiativeType[] = ["program", "project"];

describe("INITIATIVE_CONFIG — both kinds round-trip through one layer", () => {
  it("maps every type to a self-consistent {type, kind, collection}", () => {
    for (const type of TYPES) {
      const cfg = INITIATIVE_CONFIG[type];
      expect(cfg.type).toBe(type);
      expect(cfg.collection).toBe(type === "program" ? "programs" : "projects");
      expect(cfg.kind).toBe(type === "program" ? "Program" : "Project");
    }
  });

  it("INITIATIVE_TYPE is the exact inverse of the config's kind field", () => {
    for (const type of TYPES) {
      expect(INITIATIVE_TYPE[INITIATIVE_CONFIG[type].kind]).toBe(type);
    }
  });

  it("each kind's list cache is namespaced under its own collection (no cross-kind bleed)", () => {
    const programKey = initiativeKeys(INITIATIVE_CONFIG.program.collection).byTerm("t");
    const projectKey = initiativeKeys(INITIATIVE_CONFIG.project.collection).byTerm("t");
    expect(programKey[0]).toBe("programs");
    expect(projectKey[0]).toBe("projects");
    expect(programKey).not.toEqual(projectKey);
  });
});
