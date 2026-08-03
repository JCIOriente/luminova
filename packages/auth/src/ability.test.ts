import { describe, expect, it } from "vitest";
import { subject } from "@casl/ability";
import { buildAbility } from "./ability";
import { roleClaims } from "./test-helpers";
import type { AuthClaims, Role } from "./roles";

const UID = "self-uid";
function ability(claims: AuthClaims) {
  return buildAbility(claims, UID);
}

describe("buildAbility", () => {
  it("Admin can manage everything", () => {
    const a = ability(roleClaims("Admin"));
    expect(a.can("manage", "all")).toBe(true);
    expect(a.can("delete", "Member")).toBe(true);
  });

  it("Membership manages members and reads points, but no longer allies", () => {
    // The Ally trio moved to Secretaría with the nine-role table.
    const a = ability(roleClaims("Membership"));
    expect(a.can("create", "Member")).toBe(true);
    expect(a.can("update", "Member")).toBe(true);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("read", "Ally")).toBe(false);
  });

  it("Secretary owns the ally, lead and notification surfaces", () => {
    const a = ability(roleClaims("Secretary"));
    for (const s of ["Ally", "Lead", "Notification"] as const)
      expect(a.can("manage", s), s).toBe(true);
    expect(a.can("read", "Member")).toBe(false);
  });

  it("ActivityManager is the activity-only slice of ProjectManager", () => {
    const a = ability(roleClaims("ActivityManager"));
    expect(a.can("manage", "Activity")).toBe(true);
    expect(a.can("checkIn", "Attendance")).toBe(true);
    expect(a.can("manage", "Project")).toBe(false);
    expect(a.can("read", "Member")).toBe(false);
  });

  it("Treasury reads members/points only", () => {
    const a = ability(roleClaims("Treasury"));
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("ExecutiveCommittee reads broadly and no longer manages positions", () => {
    const a = ability(roleClaims("ExecutiveCommittee"));
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("read", "Project")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
    expect(a.can("manage", "Position")).toBe(false);
  });

  it("ProjectManager manages programs/projects and reads allies", () => {
    const a = ability(roleClaims("ProjectManager"));
    expect(a.can("manage", "Project")).toBe(true);
    expect(a.can("manage", "Program")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("ProjectManager manages activities and can check in (operates the day-of)", () => {
    const a = ability(roleClaims("ProjectManager"));
    expect(a.can("create", "Activity")).toBe(true);
    expect(a.can("read", "Activity")).toBe(true);
    expect(a.can("checkIn", "Attendance")).toBe(true);
  });

  it("does not grant a plain Member activity management", () => {
    const a = ability({ roles: ["Member"] });
    expect(a.can("create", "Activity")).toBe(false);
    expect(a.can("checkIn", "Attendance")).toBe(false);
  });

  it("Scanner check-in and activity reads come from the perms claim, not a conditional grant", () => {
    const a = ability(roleClaims("Scanner"));
    expect(a.can("checkIn", "Attendance")).toBe(true);
    expect(a.can("read", "Activity")).toBe(true);
    expect(a.can("read", "Member")).toBe(false);
    expect(a.can("update", "Activity")).toBe(false);
  });

  it("a roles-only Scanner claim (no perms) grants nothing — event scoping is gone", () => {
    // The old conditional grant meant {roles:['Scanner']} alone conferred a scoped
    // checkIn. It no longer does: authority is the perms claim, full stop.
    const a = ability({ roles: ["Scanner"] });
    expect(a.can("checkIn", "Attendance")).toBe(false);
    expect(a.can("read", "Activity")).toBe(false);
  });

  it("Member can read/update only their own profile", () => {
    const a = ability({ roles: ["Member"] });
    expect(a.can("read", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: "other" }))).toBe(false);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("read", "Project")).toBe(true);
  });

  it("no longer lets ExecutiveCommittee manage the position catalog", () => {
    const ability = buildAbility(roleClaims("ExecutiveCommittee"), "u1");
    expect(ability.can("manage", "Position")).toBe(false);
  });

  it("lets Membership read but not manage positions", () => {
    const ability = buildAbility(roleClaims("Membership"), "u1");
    expect(ability.can("read", "Position")).toBe(true);
    expect(ability.can("create", "Position")).toBe(false);
  });

  it("additive roles union their abilities", () => {
    const a = ability(roleClaims("Membership", "ProjectManager"));
    expect(a.can("create", "Member")).toBe(true);
    expect(a.can("manage", "Project")).toBe(true);
  });

  it("no roles grants nothing", () => {
    const a = ability({ roles: [] });
    expect(a.can("read", "Member")).toBe(false);
    expect(a.can("read", "MemberPoints")).toBe(false);
  });

  it("grants coarse abilities from the perms claim (manage implies CRUD)", () => {
    const a = ability({ roles: ["Member"], perms: ["manage:Ally"] });
    expect(a.can("update", "Ally")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("delete", "Ally")).toBe(true);
  });

  it("perms claim drives coarse access independently of roles", () => {
    const a = ability({ roles: ["Member"], perms: ["read:Lead"] });
    expect(a.can("read", "Lead")).toBe(true);
    expect(a.can("update", "Lead")).toBe(false);
  });

  it("keeps conditional Member self-access from roles even when perms is present", () => {
    const a = ability({ roles: ["Member"], perms: [] });
    expect(a.can("update", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: "other" }))).toBe(false);
  });

  it("a roles-only claim (no perms) grants no coarse access — no fallback to the role table", () => {
    const a = buildAbility({ roles: ["Membership"] }, UID);
    expect(a.can("manage", "Member")).toBe(false);
    expect(a.can("read", "Ally")).toBe(false);
  });

  it("an empty perms claim grants no coarse access", () => {
    const a = ability({ roles: ["Membership"], perms: [] });
    expect(a.can("manage", "Member")).toBe(false);
  });

  // The perms `roleClaims` mints from BUILT_IN_ROLE_PERMS must reproduce each
  // built-in role's coarse grants exactly, so seed→claims-sync→ability can't drift.
  it("Treasury perms grant exactly its coarse access and nothing more", () => {
    const a = ability(roleClaims("Treasury"));
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
    expect(a.can("read", "Ally")).toBe(false);
  });

  it("ExecutiveCommittee perms read broadly and no longer manage Position", () => {
    const a = ability(roleClaims("ExecutiveCommittee"));
    for (const s of ["Member", "Ally", "MemberPoints", "Program", "Project"] as const)
      expect(a.can("read", s)).toBe(true);
    expect(a.can("manage", "Position")).toBe(false);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("ProjectManager perms manage initiatives + read allies + check in", () => {
    const a = ability(roleClaims("ProjectManager"));
    for (const s of ["Project", "Activity", "Program"] as const)
      expect(a.can("manage", s)).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("checkIn", "Attendance")).toBe(true);
    expect(a.can("manage", "Member")).toBe(false);
  });

  it("ignores an unknown role string without crashing", () => {
    const a = buildAbility({ roles: ["Ghost" as Role] }, UID);
    expect(a.can("read", "Member")).toBe(false);
  });
});
