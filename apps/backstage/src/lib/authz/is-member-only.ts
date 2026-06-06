import type { AuthClaims } from "@luminova/auth/roles";

const PRIVILEGED = ["Admin", "Membership", "Treasury", "ExecutiveCommittee", "ProjectManager"];

/** A member-only user: has the Member role and none of the privileged roles. Used
 *  to route them to /me instead of the admin Overview. */
export function isMemberOnly(claims: AuthClaims): boolean {
  return claims.roles.includes("Member") && !claims.roles.some((r) => PRIVILEGED.includes(r));
}
