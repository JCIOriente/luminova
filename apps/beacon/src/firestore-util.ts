import type { Timestamp } from "firebase-admin/firestore";

/** Hoisted: isSafeDocId runs once per roleId per member across a whole-collection fan-out,
 *  and a fresh TextEncoder per call is pure allocation. Stateless, so sharing one is safe. */
const UTF8 = new TextEncoder();

export function hasToMillis(v: unknown): v is Timestamp {
  return typeof (v as { toMillis?: unknown })?.toMillis === "function";
}

/** Whether `id` is safe to interpolate into a `collection/${id}` doc-path template.
 *
 *  The rejected shapes do NOT all fail at the same point, and an earlier version of this
 *  comment flattened them into "`db.doc()` throws": only the empty and "/"-bearing cases
 *  throw synchronously in `db.doc()` (wrong path-segment count). `.`, `..` and `__x__` build
 *  a reference fine and fail LATER, at `get()`, with a permanent INVALID_ARGUMENT from the
 *  server. Either way the failure is permanent rather than transient, which is the property
 *  that matters: on a retry:true trigger it is a redelivery loop, and on a claims read it
 *  fails that member's sync forever (every later write re-throws, because the offending id
 *  persists in the doc) until someone edits it out.
 *  Screen instead — the id contributing nothing fails closed.
 *  Extracted from currentCargoId, which was the first path to need it. */
export function isSafeDocId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.includes("/")) return false;
  if (id === "." || id === "..") return false;
  if (id.startsWith("__") && id.endsWith("__")) return false;
  return UTF8.encode(id).length <= 1500;
}
