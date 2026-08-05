import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { AuthClaims } from "@luminova/auth/roles";
import { buildCan } from "../../../lib/authz/use-can";
import { showsPositionsOnlyEditor } from "./member-edit-gate";

const UID = "uid-self";
const gateFor = (claims: AuthClaims) => buildCan(buildAbility(claims, UID), claims);

describe("showsPositionsOnlyEditor", () => {
  it("BLOCKING: hides it from ExecutiveCommittee — the rule it mapped to is gone", () => {
    // The old gate was `!canEdit && hasRole(['ExecutiveCommittee'])`, aimed at the
    // dedicated hasOnly(['positions']) allow-rule. This PR deletes that rule along with
    // manage:Position, so a role gate would render CEL an org-chart form whose submit is
    // denied every time — permanently, not just across the deploy window.
    expect(showsPositionsOnlyEditor(gateFor(roleClaims("ExecutiveCommittee")))).toBe(false);
    // Nor does riding on top of Member (which every provisioned user carries) revive it.
    expect(showsPositionsOnlyEditor(gateFor(roleClaims("ExecutiveCommittee", "Member")))).toBe(
      false,
    );
  });

  it("hides it from every other built-in principal that cannot write positions", () => {
    for (const role of ["Member", "Treasury", "Scanner", "ProjectManager"] as const) {
      expect(showsPositionsOnlyEditor(gateFor(roleClaims(role))), role).toBe(false);
    }
  });

  it("hides it from a principal who already gets the FULL form", () => {
    // Admin and Membership hold update:Member, so the full MemberForm renders; offering
    // both editors for the same fields would be the real regression here.
    expect(showsPositionsOnlyEditor(gateFor(roleClaims("Admin")))).toBe(false);
    expect(showsPositionsOnlyEditor(gateFor(roleClaims("Membership")))).toBe(false);
  });

  it("shows it to a positions-capability holder with no member write (PR 4's flag)", () => {
    expect(showsPositionsOnlyEditor(gateFor({ roles: [], perms: ["manage:Position"] }))).toBe(true);
    expect(showsPositionsOnlyEditor(gateFor({ roles: [], perms: ["read:Position"] }))).toBe(false);
  });
});
