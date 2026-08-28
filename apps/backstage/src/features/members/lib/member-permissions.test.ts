import { describe, expect, it } from "vitest";
import type { Position } from "@luminova/types";
import { effectiveRoles, isSelfMember } from "./member-permissions";

// The full truth table over (member.uid, caller uid), because the interesting cell is the one
// a bare `member.uid === uid` gets WRONG and no other cell notices. Three call sites had this
// typed by hand before it was extracted (both cargo editors and /me's self-edit gate).
describe("isSelfMember", () => {
  it("is true only when a present uid matches the caller", () => {
    expect(isSelfMember({ uid: "u1" }, "u1")).toBe(true);
  });

  it("is false for a different caller", () => {
    expect(isSelfMember({ uid: "u1" }, "u2")).toBe(false);
  });

  // BLOCKING: the trap the function exists for. An UNPROVISIONED member has no uid — the
  // commonest doc shape in the collection — and a caller whose auth has not resolved yet has
  // no uid either, so `undefined === undefined` calls a stranger "yourself". That answer feeds
  // `isSelfAssignment`, which decides whether a delegate is warned that seating this member
  // mints nothing: get it wrong and the warning fires on the wrong person.
  it("BLOCKING: is false when BOTH are undefined", () => {
    expect(isSelfMember({ uid: undefined }, undefined)).toBe(false);
  });

  it("is false for a member with no uid and a resolved caller", () => {
    expect(isSelfMember({ uid: undefined }, "u1")).toBe(false);
  });

  it("is false for a provisioned member and an unresolved caller", () => {
    expect(isSelfMember({ uid: "u1" }, undefined)).toBe(false);
  });

  // A member doc that never carried the key at all, not just one holding `undefined`. Same
  // answer, but it is the shape Firestore actually returns for an unlinked member.
  it("is false when the member doc has no uid key at all", () => {
    expect(isSelfMember({}, undefined)).toBe(false);
    expect(isSelfMember({}, "u1")).toBe(false);
  });
});

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
  it("takes grants from the current-term cargo, in ROLES order", () => {
    const member = { positions: { "2026": { cargoId: "pres", comisionIds: ["etica"] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Admin", "Member"]);
  });
  it("ignores comisión grants — comisiones are chips-only (mirrors claims-sync)", () => {
    const member = { positions: { "2026": { cargoId: null, comisionIds: ["pres"] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Member"]);
  });
  it("ignores other terms", () => {
    const member = { positions: { "2025": { cargoId: "pres", comisionIds: [] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Member"]);
  });
});
