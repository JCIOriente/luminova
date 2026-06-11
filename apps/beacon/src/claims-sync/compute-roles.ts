import { ROLES, type Role } from "@luminova/auth/roles";

/** Org roles flow only from positions; Scanner (event-scoped, set by
 *  setUserRoles) is preserved when it was already present. Output is ordered by
 *  ROLES so equality checks against existing claims are stable. */
export function computeMemberRoles(input: {
  trustedGrants: Role[];
  hadScanner: boolean;
}): Role[] {
  const set = new Set<Role>(["Member", ...input.trustedGrants]);
  if (input.hadScanner) set.add("Scanner");
  return ROLES.filter((role) => set.has(role));
}
