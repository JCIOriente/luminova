import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { AuthClaims } from "@luminova/auth/roles";
import { buildCan } from "../../../lib/authz/use-can";
import { memberEditMode } from "./member-edit-gate";

const UID = "uid-self";
const modeFor = (claims: AuthClaims) => memberEditMode(buildCan(buildAbility(claims, UID), claims));

describe("memberEditMode", () => {
  it("BLOCKING: no positions editor for ExecutiveCommittee — the rule it mapped to is gone", () => {
    // The old gate was `!canEdit && hasRole(['ExecutiveCommittee'])`, aimed at the
    // dedicated hasOnly(['positions']) allow-rule. This PR deletes that rule along with
    // manage:Position, so a role gate would render CEL an org-chart form whose submit is
    // denied every time — permanently, not just across the deploy window.
    expect(modeFor(roleClaims("ExecutiveCommittee"))).toBe("none");
    // Nor does riding on top of Member (which every provisioned user carries) revive it.
    expect(modeFor(roleClaims("ExecutiveCommittee", "Member"))).toBe("none");
  });

  it("offers nothing to the other built-in principals that cannot write members", () => {
    for (const role of ["Member", "Treasury", "Scanner", "ProjectManager"] as const) {
      expect(modeFor(roleClaims(role)), role).toBe("none");
    }
  });

  it("offers the FULL form to update:Member holders, so the two editors never both show", () => {
    expect(modeFor(roleClaims("Admin"))).toBe("full");
    expect(modeFor(roleClaims("Membership"))).toBe("full");
  });

  it("offers positions-only to a Position-capability holder with no member write (PR 4)", () => {
    expect(modeFor({ roles: [], perms: ["manage:Position"] })).toBe("positions");
    expect(modeFor({ roles: [], perms: ["read:Position"] })).toBe("none");
  });
});
