import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

export const FUNCTION_NAME = "awardPoints";

function db() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export function buildMemberPointsPath(year: string, month: string, eventId: string): string {
  return `memberPoints/${year}/${month}/${eventId}`;
}

export function getMemberPointsRef(
  year: string,
  month: string,
  eventId: string,
): DocumentReference {
  return db().doc(buildMemberPointsPath(year, month, eventId));
}

export const awardPoints = onDocumentWritten("events/{id}", async () => {
  throw new Error("not implemented");
});
