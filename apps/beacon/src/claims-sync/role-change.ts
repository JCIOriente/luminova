import type { DocumentData } from "firebase-admin/firestore";
import { isActiveRoleDoc, permsFromRoleDoc } from "./firestore-deps.js";

function permsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((p) => set.has(p));
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

  const beforeKey = typeof before.builtInKey === "string" ? before.builtInKey : null;
  const afterKey = typeof after.builtInKey === "string" ? after.builtInKey : null;
  if (beforeKey !== afterKey) return true;

  const beforeActive = isActiveRoleDoc(before);
  const afterActive = isActiveRoleDoc(after);
  if (beforeActive !== afterActive) return true;

  // Both inactive → contributes nothing regardless of its perms.
  if (!beforeActive) return false;

  return !permsEqual(permsFromRoleDoc(before), permsFromRoleDoc(after));
}
