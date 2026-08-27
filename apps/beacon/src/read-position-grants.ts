import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isSafeDocId } from "./firestore-util.js";

/** A cargo's trusted grants, or null when the id is unusable or the doc is missing.
 *
 *  Two ports need exactly this — the claims-sync trust gate (`getPosition`) and the callable
 *  power-seat guard (`getPositionGrants`) — and they must not drift: both decide whether a
 *  cargo confers power, one before minting claims and one before creating a login. They
 *  differ only in their wrapper shape, so the read lives here and each adapter wraps it.
 *
 *  `null` is the fail-closed answer for BOTH callers: an unreadable cargo is treated as
 *  power-conferring by the guard and as grant-free by the trust gate, which is the safe
 *  direction in each. */
export async function readPositionGrants(db: Firestore, id: unknown): Promise<Role[] | null> {
  if (!isSafeDocId(id)) return null;
  const snap = await db.doc(`positions/${id}`).get();
  if (!snap.exists) return null;
  const grants = (snap.data()?.grants ?? []) as unknown[];
  return grants.filter((g): g is Role => isValidRole(g));
}
