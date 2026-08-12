import { describe, expect, it } from "vitest";
import type { RoleDefinition } from "@luminova/types";
import { assignableRoles, isLiveRole } from "./role-lifecycle";

const role = (over: Partial<RoleDefinition>): RoleDefinition => ({
  id: "r",
  name: "Rol",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
  ...over,
});

// Structural stand-in for a firebase Timestamp: isLiveRole only tests null-ness, and
// importing the real class would drag the firestore SDK into a pure unit test.
const DELETED_AT = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];

describe("isLiveRole", () => {
  it("is true only for active + never-deleted", () => {
    expect(isLiveRole(role({}))).toBe(true);
  });

  it("is false for the only inactive shape production can hold", () => {
    // roleLifecycleSafe() in firestore.rules requires `deletedAt is timestamp` whenever
    // active is false, so this pair — not `active: false` alone — is what a deactivated
    // doc actually looks like on disk.
    expect(isLiveRole(role({ active: false, deletedAt: DELETED_AT }))).toBe(false);
  });

  it("is false when active is false even with no deletedAt (short-circuits on active)", () => {
    // A legacy or console-written doc. Rules now forbid producing it, but the predicate
    // must still read it as dead rather than depending on the stamp.
    expect(isLiveRole(role({ active: false }))).toBe(false);
  });

  it("is false when deletedAt is set even though active is true", () => {
    // The ghost shape: live to getAll()'s where, dead to beacon's isActiveRoleDoc.
    // Offering it for assignment would promise perms that never arrive.
    expect(isLiveRole(role({ active: true, deletedAt: DELETED_AT }))).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("drops every non-live role and keeps input order", () => {
    const live = role({ id: "a" });
    const dead = role({ id: "b", active: false, deletedAt: DELETED_AT });
    const ghost = role({ id: "c", deletedAt: DELETED_AT });
    const live2 = role({ id: "d" });
    expect(assignableRoles([live, dead, ghost, live2]).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("returns an empty array for undefined (an unresolved query)", () => {
    expect(assignableRoles(undefined)).toEqual([]);
  });

  it("keeps built-ins — the filter is about lifecycle, not about kind", () => {
    const builtIn = role({ id: "Treasury", builtIn: true, builtInKey: "Treasury" });
    expect(assignableRoles([builtIn]).map((r) => r.id)).toEqual(["Treasury"]);
  });
});
