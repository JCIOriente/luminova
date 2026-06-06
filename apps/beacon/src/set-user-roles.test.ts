import { describe, expect, it } from "vitest";
import { validateSetRolesInput } from "./set-user-roles";

describe("validateSetRolesInput", () => {
  it("accepts a valid Admin grant", () => {
    const r = validateSetRolesInput({ targetUid: "u1", roles: ["Admin"] });
    expect(r).toEqual({ targetUid: "u1", roles: ["Admin"], scannerEventIds: undefined });
  });

  it("accepts Scanner with scannerEventIds", () => {
    const r = validateSetRolesInput({
      targetUid: "u1",
      roles: ["Scanner"],
      scannerEventIds: ["evt_1"],
    });
    expect(r.scannerEventIds).toEqual(["evt_1"]);
  });

  it("rejects an empty targetUid", () => {
    expect(() => validateSetRolesInput({ targetUid: "", roles: ["Admin"] })).toThrow();
  });

  it("rejects unknown role names", () => {
    expect(() => validateSetRolesInput({ targetUid: "u1", roles: ["isCEL"] })).toThrow();
  });

  it("rejects scannerEventIds without the Scanner role", () => {
    expect(() =>
      validateSetRolesInput({ targetUid: "u1", roles: ["Member"], scannerEventIds: ["evt_1"] }),
    ).toThrow();
  });
});
