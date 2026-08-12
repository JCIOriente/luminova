import type { Timestamp } from "firebase-admin/firestore";

export function hasToMillis(v: unknown): v is Timestamp {
  return typeof (v as { toMillis?: unknown })?.toMillis === "function";
}

/** Whether `id` is safe to interpolate into a `collection/${id}` doc-path template.
 *  A "/" would reach into a nested reference; the rest are ids the client SDK accepts
 *  but the SERVER rejects with a permanent INVALID_ARGUMENT, so `db.doc()` throws.
 *  A permanent throw is the failure mode to avoid: on a retry:true trigger it is a
 *  redelivery loop, and on a claims read it fails that member's sync forever (every
 *  later write re-throws) until someone edits the offending id out of the doc.
 *  Screen instead — the id contributing nothing fails closed.
 *  Extracted from currentCargoId, which was the first path to need it. */
export function isSafeDocId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.includes("/")) return false;
  if (id === "." || id === "..") return false;
  if (id.startsWith("__") && id.endsWith("__")) return false;
  return new TextEncoder().encode(id).length <= 1500;
}
