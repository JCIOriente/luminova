import type { Member, Position } from "@luminova/types";

/**
 * Client mirror of the refusals `provisionMember` applies to a non-Admin caller — the
 * adoption guard and both halves of the power-seat guard. The reasons they throw are the
 * `ProvisionBlockReason` union in `@luminova/types` — named there, not spelled out here, so
 * this comment cannot quietly outlive a rename the way an unchecked prose copy would.
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

/** `provisionBlockedForNonAdmin` for a stored member doc.
 *
 *  `callerIsAdmin` is a PARAMETER rather than a `!isAdmin &&` at each call site, for the same
 *  reason `positionsLockedForEditor` takes its flag: three call sites typing the same conjunct
 *  is how the cargo predicates drifted, and this function is even NAMED for the conjunct. An
 *  Admin is subject to none of these refusals — beacon's guards are all `!callerHoldsAdminRole`. */
export function memberProvisionBlocked(
  member: Member,
  cargo: CargoLookup,
  callerIsAdmin: boolean,
): boolean {
  if (callerIsAdmin) return false;
  // `?? []` on absent/null only — an EMPTY-STRING cargoId must NOT be skipped. beacon's
  // readCargoIds pushes "" deliberately ("a malformed shape must never read as 'no cargo' —
  // that is the guard's own bypass"), and "" then fails isSafeDocId at the port and refuses.
  // A truthiness test here would skip it, promise an invite, and 403 with a message about a
  // cargo that does not exist. It falls through to the `cargo === undefined` clause instead.
  const cargoIds = Object.values(member.positions ?? {}).flatMap((term) =>
    term.cargoId === undefined || term.cargoId === null ? [] : [term.cargoId],
  );
  return provisionBlockedForNonAdmin({
    hasLogin: typeof member.uid === "string" && member.uid.length > 0,
    // `grant` only, mirroring beacon's hasDirectGrants: a revoke-only override mints nothing,
    // so it is not a reason to withhold the invite.
    hasDirectGrants:
      (member.roleIds?.length ?? 0) > 0 || (member.permissionOverrides?.grant?.length ?? 0) > 0,
    seatedCargos: cargoIds.map(cargo),
  });
}

/** `provisionBlockedForNonAdmin` for a member about to be CREATED: the create arm forbids
 *  `uid`, `roleIds` and `permissionOverrides` to a non-Admin, so the cargo is the only half
 *  that can be true. */
export function draftProvisionBlocked(
  cargoId: string | null | undefined,
  cargo: CargoLookup,
  callerIsAdmin: boolean,
): boolean {
  if (callerIsAdmin) return false;
  return provisionBlockedForNonAdmin({
    hasLogin: false,
    hasDirectGrants: false,
    // Explicitly null/undefined, NOT truthiness — same rule its sibling states 25 lines up.
    // `memberSchema` keeps "" out of this form today, so the divergence is latent; a mirror
    // whose two halves disagree about what "no cargo" means is how they drift apart anyway.
    seatedCargos: cargoId === null || cargoId === undefined ? [] : [cargo(cargoId)],
  });
}
