import { describe, it, expect } from "vitest";
import { ROLES } from "@luminova/types";
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
  it("treats every ROLES key except Member and Scanner as privileged", () => {
    // The list used to be five hand-typed strings. Deriving it from ROLES is the whole
    // point: a role added to the union must be privileged by default, or its holder is
    // bounced to /me on every login despite holding management capabilities.
    for (const role of ROLES) {
      const expected = role === "Member" || role === "Scanner";
      expect(isMemberOnly({ roles: ["Member", role] }), role).toBe(expected);
    }
  });
});
