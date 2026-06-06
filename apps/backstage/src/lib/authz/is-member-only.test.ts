import { describe, it, expect } from "vitest";
import { isMemberOnly } from "./is-member-only";

describe("isMemberOnly", () => {
  it("true for a plain Member", () => {
    expect(isMemberOnly({ roles: ["Member"] })).toBe(true);
  });
  it("false when any privileged role is present", () => {
    expect(isMemberOnly({ roles: ["Member", "ProjectManager"] })).toBe(false);
    expect(isMemberOnly({ roles: ["Admin"] })).toBe(false);
  });
  it("false when there are no roles at all", () => {
    expect(isMemberOnly({ roles: [] })).toBe(false);
  });
});
