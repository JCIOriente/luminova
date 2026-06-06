import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { createFirestoreStore } from "./award-points/firestore-store.js";
import { validateCheckIn } from "./award-points/check-in.js";
import {
  processCheckIn,
  processCheckInDelete,
  processInitiativeReport,
} from "./award-points/process.js";

function db() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export const awardPoints = onDocumentWritten("checkIns/{id}", async (event) => {
  const store = createFirestoreStore(db());
  const after = event.data?.after;
  if (after?.exists) {
    const checkIn = validateCheckIn(after.data());
    if (checkIn !== null) await processCheckIn(store, checkIn);
    return;
  }
  const before = event.data?.before;
  if (before?.exists) {
    const checkIn = validateCheckIn(before.data());
    if (checkIn !== null) await processCheckInDelete(store, checkIn);
  }
});

function reportTrigger(collection: "programs" | "projects") {
  return onDocumentWritten(`${collection}/{id}`, async (event) => {
    const before = event.data?.before?.data() as { finalReport?: unknown } | undefined;
    const after = event.data?.after?.data() as { finalReport?: unknown } | undefined;
    const wasFiled = before?.finalReport != null;
    const isFiled = after?.finalReport != null;
    if (wasFiled === isFiled) return; // no report-state transition
    await processInitiativeReport(createFirestoreStore(db()), event.params.id, isFiled);
  });
}

export const confirmOnProgramReport = reportTrigger("programs");
export const confirmOnProjectReport = reportTrigger("projects");

export { setUserRoles } from "./set-user-roles.js";
