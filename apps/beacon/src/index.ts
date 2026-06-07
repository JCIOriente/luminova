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
    const now = Timestamp.now();
    const after = event.data?.after;
    if (after?.exists) {
      const init = parseInitiativeWrite(after.data() as Record<string, unknown>);
      if (init !== null)
        await processInitiativeWrite(store, parentType, event.params.id, init, now);
      return;
    }
    // Initiative deleted — reconcile to an empty roster so its rows are voided.
    const before = event.data?.before;
    if (before?.exists) {
      const prev = parseInitiativeWrite(before.data() as Record<string, unknown>);
      if (prev !== null) {
        await processInitiativeWrite(
          store,
          parentType,
          event.params.id,
          {
            ...prev,
            roster: { directorId: "", coDirectorId: null, teamIds: [] },
            reportFiled: false,
            filedAtMillis: null,
          },
          now,
        );
      }
    }
  });
}

export const onProgramWritten = initiativeTrigger("programs");
export const onProjectWritten = initiativeTrigger("projects");

export { setUserRoles } from "./set-user-roles.js";
export { provisionMemberLogin } from "./provision-member-login.js";
