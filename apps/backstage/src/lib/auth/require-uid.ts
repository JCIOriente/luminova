import { getFirebase } from "@luminova/firebase";

/** Resolve the signed-in uid the rules require (e.g. `createdBy == request.auth.uid`,
 *  `auth.uid == memberId`). Shared by notification hooks that need the current uid
 *  outside a repository instance. */
export function requireUid(): string {
  const uid = getFirebase().auth.currentUser?.uid;
  if (!uid) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  return uid;
}
