import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { assertRequestedRolesActive, validateSetRolesInput } from "./set-user-roles";

describe("validateSetRolesInput", () => {
  it("validates a plain role assignment", () => {
    const r = validateSetRolesInput({ targetUid: "u1", roles: ["Admin"] });
    expect(r).toEqual({ targetUid: "u1", roles: ["Admin"] });
  });

  it("accepts the Scanner role with no event scoping", () => {
    // Event scoping was abandoned: Scanner's authority is the coarse checkIn:Attendance
    // perm, and the Attendee-only restriction is a firestore.rules conjunct.
    expect(validateSetRolesInput({ targetUid: "u1", roles: ["Scanner"] })).toEqual({
      targetUid: "u1",
      roles: ["Scanner"],
    });
  });

  it("ignores a legacy scannerEventIds argument instead of minting it", () => {
    // An old client still sending it must not get the field written into custom claims.
    const r = validateSetRolesInput({
      targetUid: "u1",
      roles: ["Scanner"],
      scannerEventIds: ["evt_1"],
    });
    expect(r).toEqual({ targetUid: "u1", roles: ["Scanner"] });
    expect(r).not.toHaveProperty("scannerEventIds");
  });

  it("rejects an empty targetUid", () => {
    expect(() => validateSetRolesInput({ targetUid: "", roles: ["Admin"] })).toThrow();
  });

  it("rejects unknown role names", () => {
    expect(() => validateSetRolesInput({ targetUid: "u1", roles: ["isCEL"] })).toThrow();
  });

  it("deduplicates repeated roles", () => {
    const r = validateSetRolesInput({ targetUid: "u1", roles: ["Admin", "Admin", "Member"] });
    expect(r.roles).toEqual(["Admin", "Member"]);
  });

  it("rejects more roles than exist", () => {
    const tooMany = [...ROLES, "Admin"];
    expect(() => validateSetRolesInput({ targetUid: "u1", roles: tooMany })).toThrow();
  });
});

describe("assertRequestedRolesActive", () => {
  // `live`, not `active`: the deps compute it with isActiveRoleDoc over BOTH `active` and
  // `deletedAt`, so a ghost doc (active:true + deletedAt set) arrives here as live:false.
  const doc = (builtInKey: string, live: boolean) => ({
    builtInKey: builtInKey as (typeof ROLES)[number],
    live,
  });

  it("BLOCKING: rejects a role whose doc exists and is deactivated", () => {
    // Minting perms:[] is not enough — the callable still writes the role NAME, and
    // name-keyed rules gates read the name. Assigning here would NEWLY grant authority
    // through a role the organization has taken out of service.
    expect(() => assertRequestedRolesActive(["Scanner"], [doc("Scanner", false)])).toThrow(
      /Scanner/,
    );
    expect(() => assertRequestedRolesActive(["Scanner"], [doc("Scanner", false)])).toThrow(
      /deactivated/i,
    );
  });

  it("accepts a role whose doc is ABSENT (the pre-seed window on a fresh project)", () => {
    expect(() => assertRequestedRolesActive(["Scanner"], [])).not.toThrow();
    expect(() => assertRequestedRolesActive(["Scanner"], [doc("Treasury", true)])).not.toThrow();
  });

  it("accepts a role whose doc is present and active", () => {
    expect(() => assertRequestedRolesActive(["Scanner"], [doc("Scanner", true)])).not.toThrow();
  });

  it("rejects the whole call when only one of several requested roles is deactivated", () => {
    expect(() =>
      assertRequestedRolesActive(
        ["Member", "Scanner"],
        [doc("Member", true), doc("Scanner", false)],
      ),
    ).toThrow(/Scanner/);
  });

  it("fails closed when duplicate docs claim one key and either is deactivated", () => {
    expect(() =>
      assertRequestedRolesActive(["Scanner"], [doc("Scanner", true), doc("Scanner", false)]),
    ).toThrow(/Scanner/);
  });
});
