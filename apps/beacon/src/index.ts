import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { createFirestoreStore, parseInitiativeWrite } from "./award-points/firestore-store.js";
import { validateCheckIn } from "./award-points/check-in.js";
import {
  processCheckIn,
  processCheckInDelete,
  processInitiativeWrite,
} from "./award-points/process.js";

// Initialize the default app once at module load. Doing this lazily inside the
// handler races the functions runtime's admin stub (getApps() can report a stub
// app so initializeApp() is skipped, yet getFirestore() then finds no default
// app). Module-load init is the reliable pattern for the emulator + prod.
if (!getApps().length) initializeApp();

function db() {
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

function initiativeTrigger(collection: "programs" | "projects") {
  const parentType = collection === "programs" ? "Program" : "Project";
  return onDocumentWritten(`${collection}/{id}`, async (event) => {
    const store = createFirestoreStore(db());
    const after = event.data?.after;
    if (after?.exists) {
      const init = parseInitiativeWrite(after.data());
      if (init === null) return;
      // createTime is stable across event retries (unlike now()), so a brand-new
      // roster row's fallback month doesn't drift between the first run and a retry.
      const stamp = after.createTime ?? Timestamp.now();
      await processInitiativeWrite(store, parentType, event.params.id, init, stamp);
      return;
    }
    // Initiative deleted — reconcile to an empty roster so its rows are voided.
    // termId is unknown/irrelevant here (no new rows; deleted rows carry their own).
    const before = event.data?.before;
    if (before?.exists) {
      const prev = parseInitiativeWrite(before.data());
      await processInitiativeWrite(
        store,
        parentType,
        event.params.id,
        {
          termId: prev?.termId ?? "",
          roster: { directorId: "", coDirectorIds: [], teamIds: [] },
          reportFiled: false,
          filedAtMillis: null,
        },
        before.createTime ?? Timestamp.now(),
      );
    }
  });
}

export const onProgramWritten = initiativeTrigger("programs");
export const onProjectWritten = initiativeTrigger("projects");

export { setUserRoles } from "./set-user-roles.js";
export { provisionMemberLogin } from "./provision-member-login.js";
