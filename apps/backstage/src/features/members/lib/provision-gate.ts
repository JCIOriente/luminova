import type { Member, Position } from "@luminova/types";

/**
 * Client mirror of the refusals `provisionMember` applies to a non-Admin caller — the
 * adoption guard (`reprovision-requires-admin`) and both halves of the power-seat guard
 * (`granted-member-requires-admin`, `power-seat-requires-admin`).
 *
 * NOT a security boundary: beacon is, and it re-derives all of this server-side from the
 * stored doc. This exists so the three entry points that offer "invitar / enviar acceso" do
 * not offer it for a member the callable refuses on every click — the render-then-die shape
 * this feature already guards against on the cargo picker. One function, not a predicate
 * re-typed per entry point: the invite drawer had it and the row menu and profile header did
 * not, which is exactly how the two cargo forms drifted before.
 *
 * Fails CLOSED in the same direction as beacon: an unresolvable cargo id counts as
 * power-conferring (beacon reads `grants === null` from an unreadable cargo the same way), so
 * a stale `positions` prop hides the affordance rather than promising a 403.
 */
// Module-local, like assignable-cargo's raw predicates: the two adapters below are the whole
// public surface, and a caller that re-assembled the input itself is how a mirror drifts from
// the guard it mirrors.
function provisionBlockedForNonAdmin(input: {
  /** The member already has a login, or an Auth account exists for their address. Only the
   *  first half is visible to the client; beacon checks both, so this is a subset — the
   *  residual case still 403s and is what `provisionErrorMessage` explains. */
  hasLogin: boolean;
  hasDirectGrants: boolean;
  /** Every seated cargo across EVERY term, resolved against the catalog. `undefined` = the id
   *  did not resolve. Beacon reads every term too: syncMemberClaims reads the current term at
   *  trigger time, so a future-term seat mints on the year rollover. */
  seatedCargos: readonly (Pick<Position, "grants"> | undefined)[];
}): boolean {
  return (
    input.hasLogin ||
    input.hasDirectGrants ||
    input.seatedCargos.some((cargo) => cargo === undefined || cargo.grants.length > 0)
  );
}

/** Resolves a cargo id against the catalog. A callback rather than a `Position[]` or a Map so
 *  each caller passes whatever it already holds — the members table has a `positionsById` Map,
 *  the profile page and the invite drawer have arrays — without one of them allocating. */
export type CargoLookup = (id: string) => Pick<Position, "grants"> | undefined;

/** `provisionBlockedForNonAdmin` for a stored member doc. */
export function memberProvisionBlocked(member: Member, cargo: CargoLookup): boolean {
  const cargoIds = Object.values(member.positions ?? {}).flatMap((term) =>
    term.cargoId ? [term.cargoId] : [],
  );
  return provisionBlockedForNonAdmin({
    hasLogin: typeof member.uid === "string" && member.uid.length > 0,
    // `grant` only, mirroring beacon's hasDirectGrants: a revoke-only override mints nothing,
    // so it is not a reason to withhold the invite.
    hasDirectGrants:
      (member.roleIds?.length ?? 0) > 0 || (member.permissionOverrides?.grant.length ?? 0) > 0,
    seatedCargos: cargoIds.map(cargo),
  });
}

/** `provisionBlockedForNonAdmin` for a member about to be CREATED: the create arm forbids
 *  `uid`, `roleIds` and `permissionOverrides` to a non-Admin, so the cargo is the only half
 *  that can be true. */
export function draftProvisionBlocked(
  cargoId: string | null | undefined,
  cargo: CargoLookup,
): boolean {
  return provisionBlockedForNonAdmin({
    hasLogin: false,
    hasDirectGrants: false,
    seatedCargos: cargoId ? [cargo(cargoId)] : [],
  });
}
