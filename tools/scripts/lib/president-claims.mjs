// Pure, import-free (no firebase-admin) producer of the president's custom claims, so it
// can be consumed both by the admin-SDK seed (seed-president.mjs) AND by the client-SDK
// firestore-rules contract test, which must assert that the EXACT claims a seeded user
// receives satisfy firestore.rules. Keeping this separate from seed-president.mjs (which
// top-level imports firebase-admin) is what makes it importable from the rules-test package.
import { permsForRoles } from "./role-seed.mjs";

/** The president holds the Member + Admin built-in roles. */
export const PRESIDENT_ROLES = ["Member", "Admin"];

/** Claims the president must hold so the self-assigned Admin cargo stays trusted on every
 *  onMemberWritten re-derivation, AND so the perm-gated Firestore rules let it read/write
 *  from the first login. `perms` is derived from the shared built-in mirror (the same union
 *  the beacon trigger computes for these roles → `manage:all`). Without it every read fails
 *  closed → the "No se pudieron cargar …" blank pages. */
export function presidentClaims() {
  return { roles: [...PRESIDENT_ROLES], perms: permsForRoles(PRESIDENT_ROLES) };
}
