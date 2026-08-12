import { ROLES, type Role } from "@luminova/auth/roles";

/** Org roles flow only from positions; Scanner is sticky — preserved when already
 *  present, cleared only by setUserRoles. (It carried an event scope until that was
 *  abandoned; its authority is now the coarse checkIn:Attendance perm plus the
 *  Attendee-only conjunct in firestore.rules.) Output is ordered by ROLES so equality
 *  checks against existing claims are stable. */
export function computeMemberRoles(input: { trustedGrants: Role[]; hadScanner: boolean }): Role[] {
  const set = new Set<Role>(["Member", ...input.trustedGrants]);
  if (input.hadScanner) set.add("Scanner");
  return ROLES.filter((role) => set.has(role));
}
