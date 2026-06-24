import { FirebaseError } from "firebase/app";

/** True when a Firestore operation failed because the security rules denied it — i.e. the
 *  signed-in user's ID token lacks the `perms`/`roles` claim the rules gate on. Distinct
 *  from a network/transient failure, so the UI and dev logs can diagnose it instead of
 *  showing a generic "couldn't load". FirestoreError extends FirebaseError, so the
 *  instanceof check covers it. */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "permission-denied";
}
