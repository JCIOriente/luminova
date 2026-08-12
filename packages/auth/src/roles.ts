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
