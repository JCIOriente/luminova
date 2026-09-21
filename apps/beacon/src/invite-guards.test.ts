import { describe, expect, it } from "vitest";
import { accountIsPrivileged, hasDirectGrants, readCargoIds } from "./invite-guards.js";
import { ADOPTABLE_ROLES, NON_PRIVILEGED_ROLES } from "./invite-guards.js";

describe("hasDirectGrants", () => {
  it("reads a clean empty as ungranted", () => {
    expect(hasDirectGrants({})).toBe(false);
    expect(hasDirectGrants({ roleIds: [], permissionOverrides: null })).toBe(false);
    expect(hasDirectGrants({ roleIds: null, permissionOverrides: { grant: [], revoke: [] } })).toBe(
      false,
    );
  });

  it("refuses on any direct grant", () => {
    expect(hasDirectGrants({ roleIds: ["r1"] })).toBe(true);
    expect(hasDirectGrants({ permissionOverrides: { grant: ["update:Showcase"] } })).toBe(true);
  });

  it("ignores a revoke-only override — it mints nothing", () => {
    expect(hasDirectGrants({ permissionOverrides: { revoke: ["update:Showcase"] } })).toBe(false);
  });

  it("fails CLOSED on a shape that is not a clean empty", () => {
    // A present-but-unparseable roleIds must refuse, never read as "no grants".
    expect(hasDirectGrants({ roleIds: "admin" })).toBe(true);
    expect(hasDirectGrants({ roleIds: {} })).toBe(true);
    // typeof [] === "object", so an array-shaped override would reach .grant === undefined
    // and read as ungranted — failing OPEN, which is what the roleIds branch refuses to do.
    expect(hasDirectGrants({ permissionOverrides: ["manage:all"] })).toBe(true);
    expect(hasDirectGrants({ permissionOverrides: "manage:all" })).toBe(true);
    expect(hasDirectGrants({ permissionOverrides: { grant: "manage:all" } })).toBe(true);
  });
});

describe("readCargoIds", () => {
  it("yields nothing for a genuinely unseated member", () => {
    expect(readCargoIds({})).toEqual([]);
    expect(readCargoIds({ positions: null })).toEqual([]);
    expect(readCargoIds({ positions: {} })).toEqual([]);
    expect(readCargoIds({ positions: { "2026": { comisionIds: [] } } })).toEqual([]);
    expect(readCargoIds({ positions: { "2026": { cargoId: null } } })).toEqual([]);
  });

  it("reads EVERY term, not only the current one", () => {
    // syncMemberClaims reads positions[currentTermKey()] at TRIGGER time, so a future-term
    // seat is invisible today and mints on the UTC-year rollover.
    expect(
      readCargoIds({
        positions: { "2026": { cargoId: "presidente" }, "2027": { cargoId: "tesorero" } },
      }).sort(),
    ).toEqual(["presidente", "tesorero"]);
  });

  it("deduplicates a cargo held across terms", () => {
    expect(
      readCargoIds({ positions: { "2026": { cargoId: "x" }, "2027": { cargoId: "x" } } }),
    ).toEqual(["x"]);
  });

  it('yields "" — never nothing — for an unreadable shape', () => {
    // "" fails isSafeDocId at the port too, so the guard refuses. A malformed shape reading
    // as "no cargo" would be the guard's own bypass.
    expect(readCargoIds({ positions: "x" })).toEqual([""]);
    expect(readCargoIds({ positions: { "2026": "x" } })).toEqual([""]);
    expect(readCargoIds({ positions: { "2026": { cargoId: "" } } })).toEqual([""]);
    expect(readCargoIds({ positions: { "2026": { cargoId: 7 } } })).toEqual([""]);
    expect(readCargoIds({ positions: { "2026": { cargoId: "a/b" } } })).toEqual([""]);
    expect(readCargoIds({ positions: { "2026": { cargoId: ".." } } })).toEqual([""]);
    expect(readCargoIds({ positions: { "2026": { cargoId: "__x__" } } })).toEqual([""]);
  });
});

describe("accountIsPrivileged", () => {
  // The table that decides whether D3 works on day one. ABSENT is a genuine empty — the
  // entire pre-existing roster predates this feature, and failing closed on absent claims
  // would make D3 dead for exactly the membership it is meant to serve. MALFORMED is
  // fail-closed. Absent != malformed.
  it.each([
    ["undefined", undefined],
    ["empty object", {}],
    ["empty roles", { roles: [] }],
    ["Member only", { roles: ["Member"] }],
    ["Member + Scanner", { roles: ["Member", "Scanner"] }],
    ["empty perms", { perms: [] }],
    ["undefined perms", { perms: undefined }],
    ["allowlisted roles + empty perms", { roles: ["Member"], perms: [] }],
  ])("reads %s as ordinary", (_label, claims) => {
    expect(accountIsPrivileged(claims)).toBe(false);
  });

  it.each([
    ["a role beyond the allowlist", { roles: ["Member", "Admin"] }],
    ["Admin alone", { roles: ["Admin"] }],
    ["any non-empty perms", { perms: ["update:Showcase"] }],
    ["roles as a string", { roles: "Admin" }],
    ["roles as an object", { roles: { 0: "Admin" } }],
    ["perms as an object", { perms: {} }],
    ["perms as a string", { perms: "manage:all" }],
    ["an unknown role", { roles: ["Member", "Tesorero"] }],
  ])("refuses %s", (_label, claims) => {
    expect(accountIsPrivileged(claims)).toBe(true);
  });
});

describe("the two role allowlists", () => {
  // They are EQUAL today and must be free to diverge: adoptedClaims asks which claims survive
  // re-binding an orphaned account, accountIsPrivileged asks whether an account is too
  // powerful for a delegate to take over. Sharing one array means widening adoption silently
  // widens who a delegate may impersonate, with no test failing. Asserted, not typed.
  it("holds the same roles today", () => {
    expect([...ADOPTABLE_ROLES].sort()).toEqual([...NON_PRIVILEGED_ROLES].sort());
  });

  it("are distinct arrays, so one can change without the other", () => {
    expect(ADOPTABLE_ROLES).not.toBe(NON_PRIVILEGED_ROLES);
  });
});
