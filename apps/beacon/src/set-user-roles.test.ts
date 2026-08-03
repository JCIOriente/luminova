import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { validateSetRolesInput } from "./set-user-roles";

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
