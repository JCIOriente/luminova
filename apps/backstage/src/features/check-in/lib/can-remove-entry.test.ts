import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";
import { canRemoveEntry } from "./can-remove-entry";

const ACT = "act-in-scope";
const OTHER = "act-out-of-scope";

function ability(claims: AuthClaims) {
  return buildAbility(claims, "self");
}

describe("canRemoveEntry", () => {
  it("coarse checkIn:Attendance holder may undo any role", () => {
    const ab = ability({ roles: ["ProjectManager"], perms: ["checkIn:Attendance"] });
    expect(canRemoveEntry(ab, ACT, { role: "Attendee" })).toBe(true);
    expect(canRemoveEntry(ab, ACT, { role: "Director" })).toBe(true);
  });

  it("manage:all (Admin) may undo any role", () => {
    const ab = ability({ roles: ["Admin"], perms: ["manage:all"] });
    expect(canRemoveEntry(ab, ACT, { role: "Team" })).toBe(true);
  });

  it("Scanner may undo Attendee rows only on in-scope events", () => {
    const ab = ability({ roles: ["Scanner"], scannerEventIds: [ACT] });
    expect(canRemoveEntry(ab, ACT, { role: "Attendee" })).toBe(true);
  });

  it("Scanner may NOT undo non-Attendee rows", () => {
    const ab = ability({ roles: ["Scanner"], scannerEventIds: [ACT] });
    expect(canRemoveEntry(ab, ACT, { role: "Director" })).toBe(false);
    expect(canRemoveEntry(ab, ACT, { role: "Team" })).toBe(false);
  });

  it("Scanner may NOT undo Attendee rows on out-of-scope events", () => {
    const ab = ability({ roles: ["Scanner"], scannerEventIds: [ACT] });
    expect(canRemoveEntry(ab, OTHER, { role: "Attendee" })).toBe(false);
  });
});
