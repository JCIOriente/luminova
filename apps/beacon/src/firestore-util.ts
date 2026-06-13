import type { Timestamp } from "firebase-admin/firestore";

export function hasToMillis(v: unknown): v is Timestamp {
  return typeof (v as { toMillis?: unknown })?.toMillis === "function";
}
