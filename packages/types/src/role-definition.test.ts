import { describe, it, expect } from "vitest";
import { BUILT_IN_ROLE_PERMS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "./role-definition.js";
import { isValidPermissionCode } from "./permission.js";
import { ROLES } from "./permission-role.js";

describe("BUILT_IN_ROLE_PERMS", () => {
  it("has an entry for every built-in role", () => {
    for (const role of ROLES) expect(BUILT_IN_ROLE_PERMS[role]).toBeDefined();
  });

  it("only contains valid permission codes", () => {
    for (const codes of Object.values(BUILT_IN_ROLE_PERMS))
      for (const code of codes) expect(isValidPermissionCode(code)).toBe(true);
  });

  it("carries no duplicate code within a role", () => {
    for (const [role, codes] of Object.entries(BUILT_IN_ROLE_PERMS))
      expect(new Set(codes).size, role).toBe(codes.length);
  });

  it("Admin is manage:all", () => {
    expect(BUILT_IN_ROLE_PERMS.Admin).toEqual(["manage:all"]);
  });

  it("Membership no longer carries the Ally trio (Secretaría owns allies)", () => {
    // Losing read/create/update:Ally is what drops /allies out of Membership's nav.
    for (const code of ["read:Ally", "create:Ally", "update:Ally"] as const)
      expect(BUILT_IN_ROLE_PERMS.Membership).not.toContain(code);
  });

  it("ExecutiveCommittee no longer carries manage:Position (cargo assignment is Admin-only)", () => {
    // Paired with the deleted positions-edit lane in firestore.rules. /positions stays in
    // CEL's nav allowlist: the collection is signedIn()-readable and the row actions gate
    // on can("update","Position"), so they keep seeing who holds what, read-only.
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).not.toContain("manage:Position");
  });

  it("ExecutiveCommittee reads the chapter broadly and may compose notifications", () => {
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).toEqual([
      "read:Member",
      "read:Ally",
      "read:MemberPoints",
      "read:Program",
      "read:Project",
      "read:Notification",
      "create:Notification",
      "read:Lead",
      "read:PointRule",
    ]);
  });

  it("Scanner holds coarse check-in access (event scoping abandoned)", () => {
    // Replaces the CASL eventId conditional. The Attendee restriction now lives as a
    // Scanner-specific CONJUNCT in firestore.rules, independent of where the perm came from.
    expect(BUILT_IN_ROLE_PERMS.Scanner).toEqual(["read:Activity", "checkIn:Attendance"]);
  });

  it("ActivityManager is the activity-only slice of ProjectManager", () => {
    expect(BUILT_IN_ROLE_PERMS.ActivityManager).toEqual(["manage:Activity", "checkIn:Attendance"]);
    for (const code of BUILT_IN_ROLE_PERMS.ActivityManager)
      expect(BUILT_IN_ROLE_PERMS.ProjectManager).toContain(code);
  });

  it("Secretary owns communications, prospects and allies", () => {
    expect(BUILT_IN_ROLE_PERMS.Secretary).toEqual([
      "manage:Notification",
      "manage:Lead",
      "manage:Ally",
    ]);
  });

  it("Member carries only read-only, member-facing coarse perms", () => {
    expect(BUILT_IN_ROLE_PERMS.Member).toEqual([
      "read:Member",
      "read:MemberPoints",
      "read:Activity",
      "read:Program",
      "read:Project",
    ]);
    for (const code of BUILT_IN_ROLE_PERMS.Member) expect(code.startsWith("read:")).toBe(true);
  });

  it("Member does NOT carry read:PointRule", () => {
    // /point-rules gates on that perm with no role allowlist, so granting it would put the
    // admin page in every member's nav.
    expect(BUILT_IN_ROLE_PERMS.Member).not.toContain("read:PointRule");
  });
});

describe("display text", () => {
  it("labels and descriptions cover exactly the ROLES keys", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual([...ROLES].sort());
  });

  it("no label or description is blank", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role].length, role).toBeGreaterThan(0);
      expect(ROLE_DESCRIPTIONS[role].length, role).toBeGreaterThan(0);
    }
  });
});
