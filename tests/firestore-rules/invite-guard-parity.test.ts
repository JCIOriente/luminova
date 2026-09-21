import { describe, expect, it } from "vitest";
import type { Member, Position } from "@luminova/types";
// The SAME modules both sides actually run. `invite-guards.ts` is the beacon half, split out
// of issue-member-invite.ts for exactly this reason — it imports only ./firestore-util.js and
// nothing from @luminova/types for value, which is what lets this package load it (same
// constraint, and the same fix, as assignable-cargo-core.ts).
import { hasDirectGrants, readCargoIds } from "../../apps/beacon/src/invite-guards";
import { memberProvisionBlocked } from "../../apps/backstage/src/features/members/lib/provision-gate";

// THE CONTRACT: for every (principal × member shape × cargo) triple, IF backstage offers the
// "invitar / recuperar acceso" control, THEN beacon's guards must allow the call.
//
// An IMPLICATION, not equality — the same discipline cargo-assignment-parity.test.ts
// documents. The client is deliberately stricter nowhere here, but it is deliberately
// BLINDER in three places, and those are the conjuncts this test does NOT cover:
//
//   - the ADOPTION branch: the client cannot see whether an Auth account already exists for
//     an unlinked member's address.
//   - the SELF-HEAL branch: nor whether a linked account was deleted out of band.
//   - accountIsPrivileged: nor another user's custom claims.
//
// All three depend on Auth-directory state no client can read, so they are handled by
// beacon's tagged refusal plus `refusalMessage` rather than by hiding the control. Showing a
// control that sometimes refuses with a clear reason is correct here; hiding it on a guess is
// what produced the #224 regression.
//
// No emulator is needed: both halves are pure predicates over a member document.

/** Beacon's non-Admin guard block, as the callable runs it — the two member-doc halves.
 *  `cargoGrants` stands in for deps.getPositionGrants: undefined = unreadable. */
function beaconGuardsAllow(
  member: Record<string, unknown>,
  cargoGrants: (id: string) => readonly string[] | undefined,
  callerIsAdmin: boolean,
): boolean {
  if (callerIsAdmin) return true;
  if (hasDirectGrants(member)) return false;
  for (const cargoId of readCargoIds(member)) {
    const grants = cargoGrants(cargoId);
    // Fail closed exactly as beacon does: `grants === null || grants.length > 0`.
    if (grants === undefined || grants.length > 0) return false;
  }
  return true;
}

const CARGOS: Record<string, readonly string[]> = {
  "grant-free": [],
  presidente: ["Admin"],
  tesorero: ["Treasury"],
};
const lookupGrants = (id: string) => CARGOS[id];
const lookupCargo = (id: string): Pick<Position, "grants"> | undefined =>
  CARGOS[id] === undefined ? undefined : ({ grants: CARGOS[id] } as Pick<Position, "grants">);

interface Fixture {
  name: string;
  member: Record<string, unknown>;
}

const base = { id: "m1", name: "Ana", email: "ana@jci.bo", active: true, deletedAt: null };

const FIXTURES: Fixture[] = [
  { name: "brand new, unprovisioned, grant-free, unseated", member: { ...base } },
  // THE D3 SHAPE: provisioned, grant-free, unseated. Before this change the client's hasLogin
  // conjunct hid the control for this member while beacon allowed the call.
  { name: "provisioned, grant-free, unseated", member: { ...base, uid: "u1" } },
  {
    name: "provisioned + grant-free cargo",
    member: {
      ...base,
      uid: "u1",
      positions: { "2026": { cargoId: "grant-free", comisionIds: [] } },
    },
  },
  {
    name: "unprovisioned + power cargo",
    member: { ...base, positions: { "2026": { cargoId: "presidente", comisionIds: [] } } },
  },
  {
    name: "provisioned + power cargo",
    member: { ...base, uid: "u1", positions: { "2026": { cargoId: "tesorero", comisionIds: [] } } },
  },
  {
    name: "FUTURE-term power cargo only",
    member: {
      ...base,
      uid: "u1",
      positions: { "2027": { cargoId: "presidente", comisionIds: [] } },
    },
  },
  { name: "direct roleIds", member: { ...base, uid: "u1", roleIds: ["r1"] } },
  {
    name: "permissionOverrides.grant",
    member: { ...base, uid: "u1", permissionOverrides: { grant: ["update:Showcase"], revoke: [] } },
  },
  {
    name: "revoke-only override (mints nothing)",
    member: { ...base, uid: "u1", permissionOverrides: { grant: [], revoke: ["update:Showcase"] } },
  },
  {
    name: "unreadable cargo id",
    member: { ...base, uid: "u1", positions: { "2026": { cargoId: "ghost", comisionIds: [] } } },
  },
  {
    name: "empty-string cargo id",
    member: { ...base, uid: "u1", positions: { "2026": { cargoId: "", comisionIds: [] } } },
  },
  {
    name: "explicitly-null cargo id",
    member: { ...base, uid: "u1", positions: { "2026": { cargoId: null, comisionIds: [] } } },
  },
];

const PRINCIPALS: { name: string; isAdmin: boolean }[] = [
  { name: "a create:MemberLogin delegate", isAdmin: false },
  { name: "an Admin", isAdmin: true },
];

describe("invite guard parity — the client never offers what beacon refuses", () => {
  for (const principal of PRINCIPALS) {
    for (const fixture of FIXTURES) {
      it(`${principal.name} · ${fixture.name}`, () => {
        const offered = !memberProvisionBlocked(
          fixture.member as unknown as Member,
          lookupCargo,
          principal.isAdmin,
        );
        if (!offered) return; // the implication is satisfied; nothing to check
        expect(beaconGuardsAllow(fixture.member, lookupGrants, principal.isAdmin)).toBe(true);
      });
    }
  }

  // WITHOUT THIS THE SUITE ABOVE PROVES NOTHING. `clientOffersInvite => beaconGuardsAllow` is
  // VACUOUSLY TRUE whenever the client offers nothing — which is precisely the defect this
  // file exists to catch. The client's `hasLogin` conjunct was a MOUNT gate in
  // member-row-menu.tsx, so before the D3 fix the delegate was offered the control for zero
  // provisioned members and every row above passed while delegated recovery shipped as dead
  // code. So: assert the offered set is non-empty for the D3 principal on the D3 member.
  it("NON-VACUITY: a delegate IS offered the control for a provisioned, grant-free member", () => {
    const d3Member = { ...base, uid: "u1" } as unknown as Member;
    expect(memberProvisionBlocked(d3Member, lookupCargo, false)).toBe(false);
  });

  it("NON-VACUITY: the delegate's offered set covers more than one fixture", () => {
    const offered = FIXTURES.filter(
      (f) => !memberProvisionBlocked(f.member as unknown as Member, lookupCargo, false),
    );
    expect(offered.length).toBeGreaterThan(1);
    // and it must still EXCLUDE every power-conferring shape
    expect(offered.map((f) => f.name)).not.toContain("provisioned + power cargo");
    expect(offered.map((f) => f.name)).not.toContain("direct roleIds");
    expect(offered.map((f) => f.name)).not.toContain("unreadable cargo id");
  });
});
