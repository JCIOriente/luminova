import { ROLES, isValidRole, type Role, type PermissionCode } from "@luminova/types";

export { ROLES, isValidRole };
export type { Role };

export interface AuthClaims {
  roles: Role[];
  /** Resolved effective coarse permission set. Absent on pre-backfill tokens. */
  perms?: PermissionCode[];
  scannerEventIds?: string[];
}

export function hasRole(claims: AuthClaims, role: Role): boolean {
  return claims.roles.includes(role);
}

export function hasAnyRole(claims: AuthClaims, roles: readonly Role[]): boolean {
  return claims.roles.some((role) => roles.includes(role));
}
