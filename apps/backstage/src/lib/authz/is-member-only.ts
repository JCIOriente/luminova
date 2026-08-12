import { ROLES } from "@luminova/types";
import type { AuthClaims } from "@luminova/auth/roles";

/** The two roles that do NOT make a user "privileged". Member is the baseline every
 *  provisioned user carries; Scanner is a single-purpose check-in grant whose holder
 *  still belongs on /me, not the board dashboard. Everything else in ROLES is a
 *  management tier — derived, not hand-listed, so a new role key can never be silently
 *  omitted and its holder bounced to /me on every login. */
const NOT_PRIVILEGED: readonly string[] = ["Member", "Scanner"];
const PRIVILEGED: readonly string[] = ROLES.filter((role) => !NOT_PRIVILEGED.includes(role));

/** A member-only user: has the Member role and none of the privileged roles. Used
 *  to route them to /me instead of the admin Overview. */
export function isMemberOnly(claims: AuthClaims): boolean {
  return claims.roles.includes("Member") && !claims.roles.some((r) => PRIVILEGED.includes(r));
}
