import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { currentTermKey, type Member, type Position } from "@luminova/types";
import { draftProvisionBlocked, memberProvisionBlocked, type CargoLookup } from "./provision-gate";

const POWER = "pos-power";
const PLAIN = "pos-plain";

const catalog: CargoLookup = (id) =>
  ({
    [POWER]: { grants: ["Secretary"] as Position["grants"] },
    [PLAIN]: { grants: [] as Position["grants"] },
  })[id];

function member(p: Partial<Member> = {}): Member {
  return {
    id: "m1",
    name: "Ana",
    email: "a@jci.bo",
    joinDate: Timestamp.now(),
    birthdate: Timestamp.now(),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...p,
  };
}

const term = currentTermKey();
const nextTerm = String(Number(term) + 1);
const seat = (cargoId: string | null, key = term) => ({
  positions: { [key]: { cargoId, comisionIds: [] } },
});

describe("memberProvisionBlocked", () => {
  it("does not block a clean, unseated member", () => {
    expect(memberProvisionBlocked(member(), catalog)).toBe(false);
  });

  it("does not block a member seated on a grant-free cargo", () => {
    // The control for the cargo clause: being seated is not the refusal, conferring power is.
    expect(memberProvisionBlocked(member(seat(PLAIN)), catalog)).toBe(false);
  });

  it("does not block a member whose only term entry has a null cargo", () => {
    expect(memberProvisionBlocked(member(seat(null)), catalog)).toBe(false);
  });

  it("blocks a member who already has a login (beacon's adoption guard)", () => {
    expect(memberProvisionBlocked(member({ uid: "u1" }), catalog)).toBe(true);
  });

  it("treats an empty-string uid as no login", () => {
    // A stored empty string is not a linked account; blocking on it would hide the invite for
    // exactly the member who still needs one.
    expect(memberProvisionBlocked(member({ uid: "" }), catalog)).toBe(false);
  });

  it("blocks a member carrying direct roleIds", () => {
    expect(memberProvisionBlocked(member({ roleIds: ["custom"] }), catalog)).toBe(true);
  });

  it("does not block on an empty roleIds array", () => {
    expect(memberProvisionBlocked(member({ roleIds: [] }), catalog)).toBe(false);
  });

  it("blocks a member carrying a permissionOverrides GRANT", () => {
    expect(
      memberProvisionBlocked(
        member({ permissionOverrides: { grant: ["update:Member"], revoke: [] } }),
        catalog,
      ),
    ).toBe(true);
  });

  // Deliberate mirror of beacon's hasDirectGrants, which checks `grant` only: a revoke-only
  // override mints nothing, so it is not a reason to withhold the invite. Widening this to
  // "has any override" would silently take the affordance away from a delegate for a member
  // who has strictly FEWER permissions than the default.
  it("BLOCKING: does NOT block on a revoke-only override — it mints nothing", () => {
    expect(
      memberProvisionBlocked(
        member({ permissionOverrides: { grant: [], revoke: ["update:Member"] } }),
        catalog,
      ),
    ).toBe(false);
  });

  it("blocks a member seated on a power-granting cargo in the CURRENT term", () => {
    expect(memberProvisionBlocked(member(seat(POWER)), catalog)).toBe(true);
  });

  // syncMemberClaims reads the current term at trigger time, so a future-term seat mints on
  // the year rollover. Reading only the current term here would offer the invite today and
  // 403 on it — beacon reads every term.
  it("BLOCKING: blocks a power-granting cargo seated in a FUTURE term", () => {
    expect(memberProvisionBlocked(member(seat(POWER, nextTerm)), catalog)).toBe(true);
  });

  it("blocks a power-granting cargo seated in a PAST term", () => {
    expect(memberProvisionBlocked(member(seat(POWER, "2020")), catalog)).toBe(true);
  });

  // Fails CLOSED in the same direction as beacon, which reads grants === null from an
  // unreadable cargo the same way. A stale or still-loading `positions` prop must hide the
  // affordance rather than promise a 403.
  it("BLOCKING: blocks when the cargo id does not resolve against the catalog", () => {
    expect(memberProvisionBlocked(member(seat("gone")), catalog)).toBe(true);
    expect(memberProvisionBlocked(member(seat(PLAIN)), () => undefined)).toBe(true);
  });

  it("blocks when any ONE term is power-granting among several clean ones", () => {
    const m = member({
      positions: {
        "2024": { cargoId: PLAIN, comisionIds: [] },
        [term]: { cargoId: POWER, comisionIds: [] },
        [nextTerm]: { cargoId: null, comisionIds: [] },
      },
    });
    expect(memberProvisionBlocked(m, catalog)).toBe(true);
  });
});

describe("draftProvisionBlocked", () => {
  it("does not block a draft with no cargo", () => {
    expect(draftProvisionBlocked(null, catalog)).toBe(false);
    expect(draftProvisionBlocked(undefined, catalog)).toBe(false);
    expect(draftProvisionBlocked("", catalog)).toBe(false);
  });

  it("does not block a draft seated on a grant-free cargo", () => {
    expect(draftProvisionBlocked(PLAIN, catalog)).toBe(false);
  });

  it("blocks a draft seated on a power-granting cargo", () => {
    expect(draftProvisionBlocked(POWER, catalog)).toBe(true);
  });

  it("BLOCKING: fails closed on a cargo id the catalog cannot resolve", () => {
    expect(draftProvisionBlocked("gone", catalog)).toBe(true);
  });
});
