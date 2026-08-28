import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isSafeDocId, truncateForLog } from "./firestore-util.js";

/** A cargo's trusted grants, or null when the id is unusable or the doc is missing.
 *
 *  Two ports need exactly this — the claims-sync trust gate (`getPosition`) and the callable
 *  power-seat guard (`getPositionGrants`) — and they must not drift: both decide whether a
 *  cargo confers power, one before minting claims and one before creating a login. They
 *  differ only in their wrapper shape, so the read lives here and each adapter wraps it.
 *
 *  `null` is the answer for an unusable id, a missing doc, or a malformed `grants` field, and
 *  it is fail-closed for BOTH callers: an unreadable cargo is treated as
 *  power-conferring by the guard and as grant-free by the trust gate, which is the safe
 *  direction in each. */
export async function readPositionGrants(db: Firestore, id: unknown): Promise<Role[] | null> {
  // Every `null` below is logged (guardrail #4). Each one is an anomaly no legitimate flow
  // produces — a routine grant-free cargo returns `[]`, not null — and each is invisible
  // downstream: the trust gate mints nothing and the provisioning guard refuses, with no
  // throw and no metric either side. Ids only, bounded — never the doc.
  if (!isSafeDocId(id)) {
    console.error("positions: cargo id is not a usable doc id — cargo unresolvable", {
      cargoIdType: typeof id,
      cargoId: typeof id === "string" ? truncateForLog(id) : null,
      cargoIdLength: typeof id === "string" ? id.length : null,
    });
    return null;
  }
  const snap = await db.doc(`positions/${id}`).get();
  if (!snap.exists) {
    console.error("positions: cargo doc is missing — cargo unresolvable", {
      cargoId: truncateForLog(id),
    });
    return null;
  }
  // A non-array `grants` returns null rather than throwing. firestore.rules short-circuits
  // every grants check on hasAnyRole(['Admin']) and never type-checks the field, so a console
  // edit or a migration can store a string or a map — and `.filter` on that is a TypeError.
  // onMemberWritten is retry:false and the bad value PERSISTS, so the throw would kill claims
  // sync for every member seated on that cargo, permanently and silently. null is fail-closed
  // for both callers: the provisioning guard reads it as power-conferring, the trust gate as
  // grant-free.
  const raw = snap.data()?.grants;
  if (raw !== undefined && raw !== null && !Array.isArray(raw)) {
    console.error("positions: cargo grants field is not an array — cargo unresolvable", {
      cargoId: truncateForLog(id),
      grantsType: typeof raw,
    });
    return null;
  }
  const grants = (raw ?? []) as unknown[];
  return grants.filter((g): g is Role => isValidRole(g));
}
