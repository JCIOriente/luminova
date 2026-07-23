import { describe, it, expect } from "vitest";
import { BUILT_IN_ROLE_PERMS } from "./role-definition.js";
import { isValidPermissionCode } from "./permission.js";
import { ROLES } from "./permission-role.js";

describe("BUILT_IN_ROLE_PERMS", () => {
  it("has an entry for every built-in role", () => {
    for (const role of ROLES) expect(BUILT_IN_ROLE_PERMS[role]).toBeDefined();
  });

  it("Admin is manage:all", () => {
    expect(BUILT_IN_ROLE_PERMS.Admin).toEqual(["manage:all"]);
  });

  it("only contains valid permission codes", () => {
    for (const codes of Object.values(BUILT_IN_ROLE_PERMS))
      for (const code of codes) expect(isValidPermissionCode(code)).toBe(true);
  });

  it("Scanner has no coarse perms (conditional only)", () => {
    expect(BUILT_IN_ROLE_PERMS.Scanner).toEqual([]);
  });

  it("Member carries only read-only, member-facing coarse perms", () => {
    expect(BUILT_IN_ROLE_PERMS.Member).toEqual(["read:Member", "read:Activity", "read:Program"]);
    for (const code of BUILT_IN_ROLE_PERMS.Member) expect(code.startsWith("read:")).toBe(true);
  });
});

describe("ExecutiveCommittee notification grant", () => {
  it("can create and read notifications", () => {
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).toContain("create:Notification");
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).toContain("read:Notification");
  });
});
