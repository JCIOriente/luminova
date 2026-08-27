import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";
import { NAV_GROUPS } from "../../components/nav-config";
import { buildCan } from "./use-can";

function can(claims: AuthClaims) {
  return buildCan(buildAbility(claims, "self"), claims);
}

const navItem = (to: string) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === to)!;

describe("buildCan", () => {
  it("perm gate follows the resolved perms claim", () => {
    const gate = can({ roles: ["Membership"], perms: ["create:Member", "update:Member"] });
    expect(gate.can("create", "Member")).toBe(true);
    expect(gate.can("update", "Member")).toBe(true);
    expect(gate.can("create", "Ally")).toBe(false);
  });

  it("manage:all perm grants any subject but does NOT imply the Admin role", () => {
    const gate = can({ roles: ["Membership"], perms: ["manage:all"] });
    expect(gate.can("update", "Role")).toBe(true);
    expect(gate.isAdmin).toBe(false);
    expect(gate.hasRole(["Admin"])).toBe(false);
  });

  it("role gate reads the roles claim, independent of perms", () => {
    const gate = can({ roles: ["ExecutiveCommittee"] });
    expect(gate.hasRole(["ExecutiveCommittee"])).toBe(true);
    expect(gate.hasRole(["Admin"])).toBe(false);
    expect(gate.hasRole(["Admin", "ProjectManager"])).toBe(false);
  });

  it("Admin role resolves isAdmin", () => {
    const gate = can({ roles: ["Admin"] });
    expect(gate.isAdmin).toBe(true);
    expect(gate.hasRole(["Admin"])).toBe(true);
  });

  // Mirrors the rules' canCurateFeatured(): Admin by ROLE, everyone else by the
  // update:Showcase PERM. ProjectManager curates because its seeded perms carry the code —
  // deactivate that role and the name survives in the claim while the perm does not.
  it("canFeatureInitiatives holds for Admin by role or an update:Showcase perm", () => {
    expect(can({ roles: ["Admin"] }).canFeatureInitiatives).toBe(true);
    expect(
      can({ roles: ["ProjectManager"], perms: ["update:Showcase"] }).canFeatureInitiatives,
    ).toBe(true);
    expect(can({ roles: ["Membership"], perms: ["manage:Member"] }).canFeatureInitiatives).toBe(
      false,
    );
  });

  it("canFeatureInitiatives holds for Admin with no perms claim at all (role disjunct)", () => {
    expect(can({ roles: ["Admin"], perms: [] }).canFeatureInitiatives).toBe(true);
  });

  it("canFeatureInitiatives holds for a perms-only holder with no curation role", () => {
    expect(can({ roles: ["Member"], perms: ["update:Showcase"] }).canFeatureInitiatives).toBe(true);
  });

  // The stale-claim case D exists to fix: the deactivated role doc contributes no perms, so
  // the surviving ProjectManager name must not re-open curation.
  it("canFeatureInitiatives is false for a ProjectManager whose role doc was deactivated", () => {
    expect(
      can({ roles: ["ProjectManager"], perms: ["manage:Project"] }).canFeatureInitiatives,
    ).toBe(false);
  });

  // hasPerm, not canDo: manage:all is reachable as a perm without the Admin role, and the
  // rules' gate is an exact code match. The client gate must not be looser than the rule.
  it("canFeatureInitiatives is false for a manage:all perm holder without the Admin role", () => {
    expect(can({ roles: ["Member"], perms: ["manage:all"] }).canFeatureInitiatives).toBe(false);
  });

  // Mirrors firestore.rules' boardSeatDelegate(): Admin by ROLE, everyone else by the exact
  // update:BoardSeat PERM.
  it("canAssignBoardSeat holds for Admin by role or an update:BoardSeat perm", () => {
    expect(can({ roles: ["Admin"] }).canAssignBoardSeat).toBe(true);
    expect(can({ roles: ["Admin"], perms: [] }).canAssignBoardSeat).toBe(true);
    expect(can({ roles: ["Member"], perms: ["update:BoardSeat"] }).canAssignBoardSeat).toBe(true);
    expect(can({ roles: ["Membership"], perms: ["manage:Member"] }).canAssignBoardSeat).toBe(false);
  });

  it("canAssignBoardSeat is false for a manage:all perm holder without the Admin role", () => {
    expect(can({ roles: ["Member"], perms: ["manage:all"] }).canAssignBoardSeat).toBe(false);
  });

  // THE C1 PIN. These were one flag while both were Admin-role-only; the delegation splits
  // them, and re-unifying would hand a seat delegate the cargo CATALOG — the door round the
  // back, since minting a grant-free CEL 'Presidente' and then seating yourself on it lands
  // you at public board rank 0.
  it("canEditCargoCatalog stays Admin-role-only — update:BoardSeat does NOT reach it", () => {
    expect(can({ roles: ["Admin"] }).canEditCargoCatalog).toBe(true);
    expect(can({ roles: ["Member"], perms: ["update:BoardSeat"] }).canEditCargoCatalog).toBe(false);
    expect(
      can({ roles: ["Member"], perms: ["update:Position", "update:BoardSeat"] })
        .canEditCargoCatalog,
    ).toBe(false);
    expect(can({ roles: ["Member"], perms: ["manage:all"] }).canEditCargoCatalog).toBe(false);
  });

  // Mirrors beacon's requireAdminOrPerm(request, "create:MemberLogin").
  it("canProvisionLogin holds for Admin by role or a create:MemberLogin perm", () => {
    expect(can({ roles: ["Admin"] }).canProvisionLogin).toBe(true);
    expect(can({ roles: ["Admin"], perms: [] }).canProvisionLogin).toBe(true);
    expect(can({ roles: ["Member"], perms: ["create:MemberLogin"] }).canProvisionLogin).toBe(true);
    expect(can({ roles: ["Membership"], perms: ["manage:Member"] }).canProvisionLogin).toBe(false);
  });

  it("canProvisionLogin is false for a manage:all perm holder without the Admin role", () => {
    expect(can({ roles: ["Member"], perms: ["manage:all"] }).canProvisionLogin).toBe(false);
  });

  // The two delegations are independent by construction — an Admin may grant emailing
  // without board seating and vice versa. Pinned because they ship together.
  it("the two delegations do not imply each other", () => {
    const seat = can({ roles: ["Member"], perms: ["update:BoardSeat"] });
    expect(seat.canAssignBoardSeat).toBe(true);
    expect(seat.canProvisionLogin).toBe(false);
    const login = can({ roles: ["Member"], perms: ["create:MemberLogin"] });
    expect(login.canProvisionLogin).toBe(true);
    expect(login.canAssignBoardSeat).toBe(false);
  });

  // Same invariant the `<Can>` gate carries: a conditional own-doc grant answers only the
  // per-document question, never the collection one.
  it("a plain Member's own-doc grant does not answer the collection question", () => {
    const gate = can({ roles: ["Member"] });
    expect(gate.can("update", "Member")).toBe(false);
    expect(gate.can("update", "Member", { uid: "self" })).toBe(true);
    expect(gate.can("update", "Member", { uid: "other" })).toBe(false);
  });

  // subject() brands the object it is handed; branding a cached Firestore doc would leak
  // CASL metadata into app state, so the probe copies first.
  it("does not tag the caller's document with CASL subject metadata", () => {
    const memberDoc = { uid: "self" };
    can({ roles: ["Member"] }).can("update", "Member", memberDoc);
    expect(Object.getOwnPropertyNames(memberDoc)).toEqual(["uid"]);
  });

  it("empty claims deny everything (fail-closed)", () => {
    const gate = can({ roles: [] });
    expect(gate.can("read", "Member")).toBe(false);
    expect(gate.isAdmin).toBe(false);
  });

  // A member-only user is redirected from `/` to `/me` by _app.index, so the Inicio
  // link is dead weight — the UI gate hides it while route access to `/` stays open.
  it("hides the Inicio dashboard link for a member-only user but keeps Mi panel", () => {
    const member = can({ roles: ["Member"], perms: ["read:Member"] });
    expect(member.navItemVisible(navItem("/"))).toBe(false);
    expect(member.navItemVisible(navItem("/me"))).toBe(true);
  });

  it("keeps the Inicio dashboard link for a privileged user", () => {
    expect(can({ roles: ["Admin"] }).navItemVisible(navItem("/"))).toBe(true);
    expect(can({ roles: ["Membership"] }).navItemVisible(navItem("/"))).toBe(true);
  });
});
