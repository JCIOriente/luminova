import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { AuthClaims } from "@luminova/auth/roles";
import { canRemoveEntry } from "./can-remove-entry";

function gate(claims: AuthClaims) {
  return { ability: buildAbility(claims, "self"), claims };
}

describe("canRemoveEntry", () => {
  it("coarse checkIn:Attendance holder may undo any role", () => {
    const { ability, claims } = gate(roleClaims("ProjectManager"));
    expect(canRemoveEntry(ability, claims, { role: "Attendee" })).toBe(true);
    expect(canRemoveEntry(ability, claims, { role: "Director" })).toBe(true);
  });

  it("manage:all (Admin) may undo any role", () => {
    const { ability, claims } = gate(roleClaims("Admin"));
    expect(canRemoveEntry(ability, claims, { role: "Team" })).toBe(true);
  });

  it("a Scanner may undo Attendee rows", () => {
    const { ability, claims } = gate(roleClaims("Scanner"));
    expect(canRemoveEntry(ability, claims, { role: "Attendee" })).toBe(true);
  });

  it("BLOCKING: a Scanner may NOT undo non-Attendee rows despite the coarse perm", () => {
    // Scanner now holds the SAME checkIn:Attendance perm as a ProjectManager, so the
    // ability alone can no longer tell them apart — the gate must ask the role, exactly as
    // the firestore.rules delete conjunct does. Otherwise the UI offers an undo the rules
    // deny (render-then-die on a destructive action).
    const { ability, claims } = gate(roleClaims("Scanner"));
    expect(canRemoveEntry(ability, claims, { role: "Director" })).toBe(false);
    expect(canRemoveEntry(ability, claims, { role: "Team" })).toBe(false);
  });

  it("a Scanner that also holds manage:Attendance may undo any role (the escape hatch)", () => {
    const claims: AuthClaims = {
      roles: ["Scanner"],
      perms: ["checkIn:Attendance", "manage:Attendance", "read:Activity"],
    };
    expect(canRemoveEntry(buildAbility(claims, "self"), claims, { role: "Director" })).toBe(true);
  });

  it("a principal without checkIn:Attendance may undo nothing", () => {
    const { ability, claims } = gate(roleClaims("Member"));
    expect(canRemoveEntry(ability, claims, { role: "Attendee" })).toBe(false);
  });
});
