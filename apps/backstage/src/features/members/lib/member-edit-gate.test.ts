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

  it("BLOCKING: a Position capability alone opens no member editor — wrong collection", () => {
    // Both editors submit to members/{id}, gated by canDo('update','Member'). manage:Position
    // governs the separate `positions` cargo catalog, and it is Admin-assignable per member
    // from the profile's permissions panel — so returning "positions" for it rendered the
    // Cargos form to someone whose every submit is PERMISSION_DENIED, permanently. The
    // "positions" arm returns in PR 4 with the members-positions rules lane it maps to.
    expect(modeFor({ roles: [], perms: ["manage:Position"] })).toBe("none");
    expect(modeFor({ roles: [], perms: ["read:Position"] })).toBe("none");
    // Even riding on the Member role every provisioned user carries, which is what makes
    // the profile page load in the first place.
    expect(modeFor({ roles: ["Member"], perms: ["manage:Position"] })).toBe("none");
  });
});
