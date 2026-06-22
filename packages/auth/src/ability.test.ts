import { describe, expect, it } from "vitest";
import { subject } from "@casl/ability";
import { buildAbility } from "./ability";
import type { AuthClaims, Role } from "./roles";

const UID = "self-uid";
function ability(claims: AuthClaims) {
  return buildAbility(claims, UID);
}

describe("buildAbility", () => {
  it("Admin can manage everything", () => {
    const a = ability({ roles: ["Admin"] });
    expect(a.can("manage", "all")).toBe(true);
    expect(a.can("delete", "Member")).toBe(true);
  });

  it("Membership manages members, reads allies/events/points", () => {
    const a = ability({ roles: ["Membership"] });
    expect(a.can("create", "Member")).toBe(true);
    expect(a.can("update", "Member")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("manage", "Payment")).toBe(false);
  });

  it("Treasury manages payments and reads members/points only", () => {
    const a = ability({ roles: ["Treasury"] });
    expect(a.can("manage", "Payment")).toBe(true);
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("ExecutiveCommittee reads broadly and writes events (reconciled with rules)", () => {
    const a = ability({ roles: ["ExecutiveCommittee"] });
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("read", "Project")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
    expect(a.can("create", "Event")).toBe(true);
  });

  it("ProjectManager manages programs/projects and reads allies/events", () => {
    const a = ability({ roles: ["ProjectManager"] });
    expect(a.can("manage", "Project")).toBe(true);
    expect(a.can("manage", "Program")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("read", "Event")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("ProjectManager manages activities and can check in (operates the day-of)", () => {
    const a = ability({ roles: ["ProjectManager"] });
    expect(a.can("create", "Activity")).toBe(true);
    expect(a.can("read", "Activity")).toBe(true);
    expect(a.can("checkIn", "Attendance")).toBe(true);
  });

  it("does not grant a plain Member activity management", () => {
    const a = ability({ roles: ["Member"] });
    expect(a.can("create", "Activity")).toBe(false);
    expect(a.can("checkIn", "Attendance")).toBe(false);
  });

  it("Scanner can check in only assigned events", () => {
    const a = ability({ roles: ["Scanner"], scannerEventIds: ["evt_1"] });
    expect(a.can("checkIn", subject("Attendance", { eventId: "evt_1" }))).toBe(true);
    expect(a.can("checkIn", subject("Attendance", { eventId: "evt_2" }))).toBe(false);
  });

  it("Scanner with no assigned events cannot check in", () => {
    const a = ability({ roles: ["Scanner"] });
    expect(a.can("checkIn", subject("Attendance", { eventId: "evt_1" }))).toBe(false);
  });

  it("Scanner can read activities (to reach check-in) but not the member directory", () => {
    const a = ability({ roles: ["Scanner"], scannerEventIds: ["evt_1"] });
    expect(a.can("read", "Activity")).toBe(true);
    expect(a.can("read", "Member")).toBe(false);
    expect(a.can("update", "Activity")).toBe(false);
  });

  it("Member can read/update only their own profile", () => {
    const a = ability({ roles: ["Member"] });
    expect(a.can("read", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: "other" }))).toBe(false);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("read", "Event")).toBe(true);
  });

  it("lets ExecutiveCommittee manage the position catalog", () => {
    const ability = buildAbility({ roles: ["ExecutiveCommittee"] }, "u1");
    expect(ability.can("manage", "Position")).toBe(true);
  });

  it("lets Membership read but not manage positions", () => {
    const ability = buildAbility({ roles: ["Membership"] }, "u1");
    expect(ability.can("read", "Position")).toBe(true);
    expect(ability.can("create", "Position")).toBe(false);
  });

  it("additive roles union their abilities", () => {
    const a = ability({ roles: ["Membership", "ProjectManager"] });
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
    const a = ability({ roles: ["Member"], perms: ["read:Payment"] });
    expect(a.can("read", "Payment")).toBe(true);
    expect(a.can("update", "Payment")).toBe(false);
  });

  it("keeps conditional Member self-access from roles even when perms is present", () => {
    const a = ability({ roles: ["Member"], perms: [] });
    expect(a.can("update", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: "other" }))).toBe(false);
  });

  it("falls back to role-derived abilities when perms is absent (pre-backfill)", () => {
    const a = ability({ roles: ["Membership"] });
    expect(a.can("manage", "Member")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
  });

  it("an empty perms claim grants no coarse access (does NOT fall back)", () => {
    const a = ability({ roles: ["Membership"], perms: [] });
    expect(a.can("manage", "Member")).toBe(false);
  });

  // Exhaustive fallback regression: BUILT_IN_ROLE_PERMS must reproduce the legacy
  // applyRole coarse grants exactly, so the pre-backfill path can't silently drift.
  it("Treasury fallback grants exactly its coarse perms and nothing more", () => {
    const a = ability({ roles: ["Treasury"] });
    expect(a.can("manage", "Payment")).toBe(true);
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
    expect(a.can("read", "Ally")).toBe(false);
  });

  it("ExecutiveCommittee fallback reads broadly, manages Position, writes Events", () => {
    const a = ability({ roles: ["ExecutiveCommittee"] });
    for (const s of ["Member", "Ally", "Event", "MemberPoints", "Program", "Project"] as const)
      expect(a.can("read", s)).toBe(true);
    expect(a.can("manage", "Position")).toBe(true);
    expect(a.can("create", "Event")).toBe(true); // reconciled with firestore.rules
    expect(a.can("update", "Member")).toBe(false);
    expect(a.can("manage", "Payment")).toBe(false);
  });

  it("ProjectManager fallback manages initiatives + reads allies/events + checks in", () => {
    const a = ability({ roles: ["ProjectManager"] });
    for (const s of ["Project", "Activity", "Program"] as const)
      expect(a.can("manage", s)).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("read", "Event")).toBe(true);
    expect(a.can("checkIn", "Attendance")).toBe(true);
    expect(a.can("manage", "Member")).toBe(false);
  });

  it("ignores an unknown role string in the fallback without crashing", () => {
    const a = buildAbility({ roles: ["Ghost" as Role] }, UID);
    expect(a.can("read", "Member")).toBe(false);
  });
});
