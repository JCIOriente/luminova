import { describe, it, expect } from "vitest";
import { validateProvisionInput, nextClaims } from "./provision-member-login";

describe("validateProvisionInput", () => {
  it("accepts a clean memberId", () => {
    expect(validateProvisionInput({ memberId: "m-1" })).toEqual({ memberId: "m-1" });
  });
  it("rejects missing / empty / unclean memberId", () => {
    expect(() => validateProvisionInput({})).toThrow();
    expect(() => validateProvisionInput({ memberId: "" })).toThrow();
    expect(() => validateProvisionInput({ memberId: "a/b" })).toThrow();
  });
});

describe("nextClaims", () => {
  it("adds Member to empty claims", () => {
    expect(nextClaims(undefined, "Member")).toEqual({ roles: ["Member"] });
  });
  it("merges Member without clobbering existing roles / scannerEventIds", () => {
    expect(nextClaims({ roles: ["ProjectManager"], scannerEventIds: ["e1"] }, "Member")).toEqual({
      roles: ["ProjectManager", "Member"],
      scannerEventIds: ["e1"],
    });
  });
  it("is idempotent when the role is already present", () => {
    expect(nextClaims({ roles: ["Member"] }, "Member")).toEqual({ roles: ["Member"] });
  });
});
