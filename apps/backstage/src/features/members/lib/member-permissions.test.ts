import { describe, expect, it } from "vitest";
import type { Position } from "@luminova/types";
import { effectiveRoles } from "./member-permissions";

const pos = (id: string, grants: Position["grants"]): Position => ({
  id,
  title: id,
  titleFemale: id,
  category: "CEL",
  grants,
  term: null,
  description: "",
  active: true,
  deletedAt: null,
});

const byId = new Map([pos("pres", ["Admin"]), pos("etica", [])].map((p) => [p.id, p]));

describe("effectiveRoles", () => {
  it("always includes Member", () => {
    expect(effectiveRoles({ positions: {} }, byId, "2026")).toEqual(["Member"]);
  });
  it("unions current-term cargo + comisión grants in ROLES order", () => {
    const member = { positions: { "2026": { cargoId: "pres", comisionIds: ["etica"] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Admin", "Member"]);
  });
  it("ignores other terms", () => {
    const member = { positions: { "2025": { cargoId: "pres", comisionIds: [] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Member"]);
  });
});
