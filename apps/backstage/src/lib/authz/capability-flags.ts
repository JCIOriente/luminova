import { hasAnyRole, hasPerm, type AuthClaims } from "@luminova/auth/roles";
import type { PermissionCode } from "@luminova/types";

/**
 * The claims → capability-flag derivation, split out of `buildCan` (./use-can) for ONE reason:
 * `tests/firestore-rules/cargo-assignment-parity.test.ts` needs the flags the member forms are
 * actually wired from, and it cannot load `use-can.ts` (React) — so it re-implemented this
 * mapping by hand, which is the mirror class that whole test exists to delete, applied to the
 * very flag whose widening caused the #224 regression.
 *
 * No runtime `@luminova/types` import: `PermissionCode` is type-only and erased, the same trick
 * `assignable-cargo-core.ts` and `nav-config.ts` document. Keep it that way — the rules-test
 * package cannot resolve that package at runtime.
 */

/** The shape every delegable capability gate takes: the Admin ROLE, or one exact permission
 *  code. Extracted at the third occurrence — `hasPerm` is deliberately NOT `abilityAllows`,
 *  and re-deriving that decision per flag is how one of them ends up looser than its rule.
 *  See `canFeatureInitiatives` below for the full reasoning it encodes. */
function adminOrPerm(claims: AuthClaims, code: PermissionCode): boolean {
  return hasAnyRole(claims, ["Admin"]) || hasPerm(claims, code);
}

export interface CapabilityFlags {
  /** Shorthand for the Admin role (not the `manage:all` perm). */
  readonly isAdmin: boolean;
  /** May curate the public /programas page (rules' `canCurateFeatured`). */
  readonly canFeatureInitiatives: boolean;
  /** May SEAT a member on a cargo the plain non-Admin lane refuses — a power-granting one or
   *  a CEL one. Mirrors firestore.rules' `boardSeatDelegate()` disjunct for disjunct.
   *  Governs the member CREATE and UPDATE lanes only. */
  readonly canAssignBoardSeat: boolean;
  /** May AUTHOR the positions catalog. Split from `canAssignBoardSeat` and deliberately NOT
   *  widened by the delegation: re-unifying them would hand a seat delegate the catalog, and
   *  the catalog is the door round the back — mint a grant-free CEL 'Presidente', then seat
   *  yourself on it at public board rank 0. */
  readonly canEditCargoCatalog: boolean;
  /** May run `provisionMemberLogin`. Mirrors beacon's
   *  `requireAdminOrPerm(request, "create:MemberLogin")`. Cargo-agnostic. NOT the invite email
   *  itself — `requestPasswordReset` is a client-side `sendPasswordResetEmail` any signed-in
   *  user can already call. */
  readonly canProvisionLogin: boolean;
}

export function capabilityFlags(claims: AuthClaims): CapabilityFlags {
  return {
    isAdmin: hasAnyRole(claims, ["Admin"]),
    // Mirrors canCurateFeatured() in firestore.rules disjunct for disjunct: Admin by ROLE
    // (locked + undeactivatable, so its name carries none of the staleness this gate fixes),
    // everyone else by the update:Showcase PERM — so deactivating a role revokes curation,
    // which the surviving role NAME in the claim would not.
    //
    // `hasPerm` is the client mirror of the rules' own `hasPerm()` — an exact code test on
    // the claim, deliberately NOT `abilityAllows(..., "update", "Showcase")`: CASL's
    // `manage:all` wildcard would answer yes to the ability question. That would show the
    // Destacar checkbox to a manage:all perm holder whose write firestore.rules then
    // rejects — taking the whole save down with it. `probe.ts` does not help here: it
    // narrows CONDITIONAL grants, and the divergence is the unconditional wildcard.
    canFeatureInitiatives: adminOrPerm(claims, "update:Showcase"),
    // Same exact-code discipline as canFeatureInitiatives above, for the same reason: a
    // `manage:all` holder must not see an affordance firestore.rules then rejects.
    canAssignBoardSeat: adminOrPerm(claims, "update:BoardSeat"),
    canEditCargoCatalog: hasAnyRole(claims, ["Admin"]),
    canProvisionLogin: adminOrPerm(claims, "create:MemberLogin"),
  };
}
