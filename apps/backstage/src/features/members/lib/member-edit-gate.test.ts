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

  it("BLOCKING: update:Member wins over update:Position, so the two editors never both render", () => {
    // Order is the whole contract of this function: a principal holding both capabilities
    // must get the full form, never the positions-only one, or the profile page would
    // mount two competing editors over the same doc.
    expect(modeFor({ roles: [], perms: ["update:Member", "update:Position"] })).toBe("full");
  });

  it("opens the positions editor for an update:Position holder — the members-positions lane", () => {
    // firestore.rules' fourth members update arm is keyed on canDo('update','Position') and
    // confined to hasOnly(['positions']), so this principal's cargo submit really lands.
    expect(modeFor({ roles: [], perms: ["update:Position"] })).toBe("positions");
    // CASL `manage` satisfies can("update", …) exactly as canDo() treats manage:Position as
    // satisfying update:Position in the rules — so the manage holder gets the same editor.
    expect(modeFor({ roles: [], perms: ["manage:Position"] })).toBe("positions");
    // Even riding on the Member role every provisioned user carries, which is what makes
    // the profile page load in the first place.
    expect(modeFor({ roles: ["Member"], perms: ["manage:Position"] })).toBe("positions");
  });

  it("BLOCKING: read:Position alone opens no member editor — reading the catalog is not assigning", () => {
    // The real guard: `read:Position` is what a plain Member and Membership both carry for
    // chip resolution on /me. It confers no write on members/{id}, so rendering the Cargos
    // form for it would be the render-then-PERMISSION_DENIED shape this gate exists to remove.
    expect(modeFor({ roles: [], perms: ["read:Position"] })).toBe("none");
    expect(modeFor({ roles: ["Member"], perms: ["read:Position"] })).toBe("none");
  });
});
