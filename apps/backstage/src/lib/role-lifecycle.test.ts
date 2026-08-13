import { describe, expect, it } from "vitest";
import type { RoleDefinition } from "@luminova/types";
import { assignableRoles, isLiveRole, isUndeactivatableRole } from "./role-lifecycle";

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

  it("is false for the shape a deactivated doc actually has on disk", () => {
    // roleLifecycleSafe() in firestore.rules requires `deletedAt is timestamp` whenever
    // active is false, so this pair — not `active: false` alone — is what production holds.
    // DOCUMENTATION, not conjunct coverage: with both fields dead, either conjunct alone
    // already returns false, so no single-conjunct mutation can distinguish this case. The
    // two one-sided cases below are the ones that pin each conjunct individually.
    expect(isLiveRole(role({ active: false, deletedAt: DELETED_AT }))).toBe(false);
  });

  it("is false on `active: false` with deletedAt null — only the active conjunct catches it", () => {
    // A legacy or console-written doc. Rules now forbid producing it, but the predicate
    // must still read it as dead rather than depending on the stamp. Drop `role.active`
    // from isLiveRole and ONLY this case goes red.
    expect(isLiveRole(role({ active: false, deletedAt: null }))).toBe(false);
  });

  it("is false on an active:true ghost — only the deletedAt conjunct catches it", () => {
    // Live to getAll()'s where, dead to beacon's isActiveRoleDoc. Offering it for assignment
    // would promise perms that never arrive. Drop the `deletedAt` conjunct and ONLY this
    // case goes red.
    expect(isLiveRole(role({ active: true, deletedAt: DELETED_AT }))).toBe(false);
  });
});

describe("isUndeactivatableRole", () => {
  // The UI mirror of firestore.rules' roleDeactivationAllowed(), which bars deactivation on
  // `builtInKey == 'Member'` and `builtInKey == 'Admin'`. Keyed on builtInKey, NOT on
  // `locked` — that independence is the whole point of the rules clause, and a mirror keyed
  // on the wrong field renders an affordance the write denies.
  it.each(["Member", "Admin"] as const)("is true for the %s built-in key", (key) => {
    expect(isUndeactivatableRole(role({ builtIn: true, builtInKey: key }))).toBe(true);
  });

  it("is true for Admin even when the doc's `locked` lags the seed", () => {
    // The documented prod shape. A `locked`-keyed check returned false here and offered
    // "Desactivar rol" for a write the rules deny.
    expect(isUndeactivatableRole(role({ builtIn: true, builtInKey: "Admin", locked: false }))).toBe(
      true,
    );
  });

  it("is false for another built-in — the bar is these two keys, not built-ins as a class", () => {
    expect(isUndeactivatableRole(role({ builtIn: true, builtInKey: "Treasury" }))).toBe(false);
  });

  it("is false for a custom role whose id spells a barred key", () => {
    // Matching on `id` instead of `builtInKey` would make a custom role named after Admin
    // permanently undeactivatable. Rules read builtInKey; so does this.
    expect(isUndeactivatableRole(role({ id: "Admin", builtIn: false, builtInKey: null }))).toBe(
      false,
    );
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
