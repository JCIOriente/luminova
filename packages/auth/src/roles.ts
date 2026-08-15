import { ROLES, isValidRole, type Role, type PermissionCode } from "@luminova/types";

export { ROLES, isValidRole };
export type { Role };

export interface AuthClaims {
  roles: Role[];
  /** Resolved effective coarse permission set, minted by claims-sync. When absent
   *  the member has zero coarse abilities — `buildAbility` does not fall back to a
   *  role table. */
  perms?: PermissionCode[];
}

export function hasRole(claims: AuthClaims, role: Role): boolean {
  return claims.roles.includes(role);
}

export function hasAnyRole(claims: AuthClaims, roles: readonly Role[]): boolean {
  return claims.roles.some((role) => roles.includes(role));
}

/** Client mirror of `hasPerm()` in firestore.rules: does the claim carry this EXACT code?
 *  No `manage:all` / `manage:<subject>` expansion — that is the rules' `canDo()`, and on
 *  this side the CASL ability (`buildAbility` / `abilityAllows`) is what answers it.
 *
 *  Use this only where the rule being mirrored is itself `hasPerm` — a gate that reads the
 *  ability instead would show an affordance whose write the rules then reject. */
export function hasPerm(claims: AuthClaims, code: PermissionCode): boolean {
  return (claims.perms ?? []).includes(code);
}
