import type { DocumentData } from "firebase-admin/firestore";
import { builtInKeyFromRoleDoc, isActiveRoleDoc, permsFromRoleDoc } from "./role-doc.js";

// Compare as sets, not arrays: permsFromRoleDoc does not dedup and the rules do
// not enforce uniqueness, so a dropped-permission edit that leaves a duplicate
// behind (["X","Y"] -> ["X","X"]) keeps array length constant — an array-wise
// "equal" would misread that real revocation as unchanged and strand stale claims.
function permsEqual(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((p) => setB.has(p));
}

/**
 * Whether a roles/{id} write changed anything onRoleWritten must re-sync.
 *
 * A role's contribution to a member's claims is exactly its permission set when
 * active, and nothing when inactive; `builtInKey` decides WHICH members are
 * affected (a built-in edit re-syncs every provisioned member, a custom edit only
 * its holders). So a re-sync is only needed when the active-status, the perms of
 * an active role, or the builtInKey actually change. Create/delete always count.
 * This lets a metadata-only edit (name/description, or a re-touch with identical
 * fields, e.g. a redelivered write) skip the full members-collection scan.
 */
export function roleClaimsChanged(
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): boolean {
  if (!before || !after) return true;

  if (builtInKeyFromRoleDoc(before) !== builtInKeyFromRoleDoc(after)) return true;

  const beforeActive = isActiveRoleDoc(before);
  const afterActive = isActiveRoleDoc(after);
  if (beforeActive !== afterActive) return true;

  // Both inactive → contributes nothing regardless of its perms or builtIn flag.
  if (!beforeActive) return false;

  // A built-in role contributes perms only while builtIn === true (the gate in
  // getRoleDocsByBuiltInKeys), so a flip of that flag changes what holders resolve.
  if ((before.builtIn === true) !== (after.builtIn === true)) return true;

  return !permsEqual(permsFromRoleDoc(before), permsFromRoleDoc(after));
}
