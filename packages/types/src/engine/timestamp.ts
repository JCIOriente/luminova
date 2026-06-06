/**
 * SDK-neutral Firestore Timestamp shape. Satisfied structurally by BOTH the
 * `firebase/firestore` (client) and `firebase-admin/firestore` Timestamp classes,
 * so the engine model can be consumed by backstage (client) and beacon (admin)
 * without coupling to either SDK.
 */
export interface Timestamp {
  toMillis(): number;
  toDate(): Date;
}
