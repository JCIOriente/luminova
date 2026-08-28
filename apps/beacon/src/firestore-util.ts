import type { Timestamp } from "firebase-admin/firestore";

/** Hoisted: isSafeDocId runs once per roleId per member across a whole-collection fan-out,
 *  and a fresh TextEncoder per call is pure allocation. Stateless, so sharing one is safe. */
const UTF8 = new TextEncoder();

export function hasToMillis(v: unknown): v is Timestamp {
  return typeof (v as { toMillis?: unknown })?.toMillis === "function";
}

/** Whether `id` is safe to interpolate into a `collection/${id}` doc-path template.
 *
 *  The rejected shapes do not all fail at the same point: the empty and "/"-bearing cases
 *  throw synchronously in `db.doc()` (wrong path-segment count), while `.`, `..` and `__x__`
 *  build a reference fine and fail LATER, at `get()`, with a permanent INVALID_ARGUMENT from
 *  the server. Either way the failure is permanent rather than transient, which is the
 *  property that matters: on a retry:true trigger it is a redelivery loop, and on a claims
 *  read it fails that member's sync forever (every later write re-throws, because the
 *  offending id persists in the doc) until someone edits it out.
 *  Screen instead — the id contributing nothing fails closed. */
export function isSafeDocId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.includes("/")) return false;
  if (id === "." || id === "..") return false;
  if (id.startsWith("__") && id.endsWith("__")) return false;
  return UTF8.encode(id).length <= 1500;
}

/** A structured log sink, injected so a shared fail-closed read is not welded to `console`. */
export type LogSink = (message: string, meta: Record<string, unknown>) => void;

/** The default sinks, HERE rather than one per adapter file. Routing beacon's structured logs
 *  anywhere else — a Cloud Logging client, a redaction wrapper, another severity split — is
 *  then one edit that reaches every port, which is the property `claims-sync/firestore-deps.ts`
 *  claimed while a byte-identical second copy lived in `provision-deps.ts` and silently kept
 *  `readPositionGrants`'s anomaly lines on the old path. */
export const logError: LogSink = (message, meta) => console.error(message, meta);
export const logWarn: LogSink = (message, meta) => console.warn(message, meta);

const LOG_ID_MAX_CHARS = 64;

/** An id bounded for a structured-log field. The values screened by `isSafeDocId` run to
 *  1500 bytes and Cloud Logging drops an over-large entry ENTIRELY — so serializing them raw
 *  loses the anomaly precisely when it is biggest. Shared so every screen's log line is
 *  bounded the same way. */
export function truncateForLog(value: string): string {
  if (value.length <= LOG_ID_MAX_CHARS) return value;
  const cut = value.slice(0, LOG_ID_MAX_CHARS);
  // A cut at a fixed UTF-16 index can land BETWEEN the halves of a surrogate pair, leaving a
  // lone high surrogate — an ill-formed string. JSON.stringify escapes it rather than throwing
  // (well-formed stringify, ES2019), so nothing here fails; the damage is downstream, in
  // whatever reads the log field. Drop the orphan instead of shipping it.
  const last = cut.charCodeAt(cut.length - 1);
  const orphaned = last >= 0xd800 && last <= 0xdbff;
  return `${orphaned ? cut.slice(0, -1) : cut}…`;
}
