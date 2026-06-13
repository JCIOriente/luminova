import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { createFirestoreStore, parseInitiativeWrite } from "./award-points/firestore-store.js";
import { validateCheckIn } from "./award-points/check-in.js";
import {
  processCheckIn,
  processCheckInDelete,
  processInitiativeWrite,
} from "./award-points/process.js";
import {
  activityParentRefs,
  activityShowcasePhotos,
  isProjectable,
  projectInitiative,
  rosterMemberIds,
} from "./showcase/project-initiative.js";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { syncMemberClaims } from "./claims-sync/sync.js";
import { parseMember } from "./claims-sync/parse-member.js";

// Initialize the default app once at module load. Doing this lazily inside the
// handler races the functions runtime's admin stub (getApps() can report a stub
// app so initializeApp() is skipped, yet getFirestore() then finds no default
// app). Module-load init is the reliable pattern for the emulator + prod.
if (!getApps().length) initializeApp();

function db() {
  return getFirestore();
}

async function resolveMemberNames(
  database: Firestore,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((id) => database.doc(`members/${id}`));
    const snaps = await database.getAll(...refs);
    for (const snap of snaps) {
      const name = snap.get("name");
      if (typeof name === "string") names.set(snap.id, name);
    }
  }
  return names;
}

// Defensive bound on the child-activity roll-up query — far above any realistic
// per-initiative activity count, but caps memory/latency on a pathological parent.
const ACTIVITY_ROLLUP_CAP = 500;

async function projectShowcase(
  database: Firestore,
  kind: "Program" | "Project",
  id: string,
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const ref = database.doc(`showcase/${id}`);
  if (!data || !isProjectable(data)) {
    await ref.delete();
    return;
  }
  const names = await resolveMemberNames(database, rosterMemberIds(data));
  const item = projectInitiative(kind, id, data, (mid) => names.get(mid) ?? null);
  if (!item) {
    await ref.delete();
    return;
  }
  const activitySnap = await database
    .collection("activities")
    .where("parentId", "==", id)
    .limit(ACTIVITY_ROLLUP_CAP)
    .get();
  const activityPhotos = activityShowcasePhotos(
    kind,
    activitySnap.docs.map((d) => ({ id: d.id, data: d.data() })),
  );
  item.photos = [...item.photos, ...activityPhotos];
  await ref.set(item);
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
    const database = db();
    const store = createFirestoreStore(database);
    const after = event.data?.after;
    if (after?.exists) {
      const init = parseInitiativeWrite(after.data());
      if (init === null) return;
      // createTime is stable across event retries (unlike now()), so a brand-new
      // roster row's fallback month doesn't drift between the first run and a retry.
      const stamp = after.createTime ?? Timestamp.now();
      await processInitiativeWrite(store, parentType, event.params.id, init, stamp);
      // Projection runs after engine work so a showcase error never pre-empts points.
      try {
        await projectShowcase(
          database,
          parentType,
          event.params.id,
          after.data() as Record<string, unknown>,
        );
      } catch (err) {
        console.error("showcase projection failed", { id: event.params.id, err });
      }
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
      try {
        await projectShowcase(database, parentType, event.params.id, undefined);
      } catch (err) {
        console.error("showcase projection failed", { id: event.params.id, err });
      }
    }
  });
}

export const onProgramWritten = initiativeTrigger("programs");
export const onProjectWritten = initiativeTrigger("projects");

export const onActivityWritten = onDocumentWritten("activities/{id}", async (event) => {
  const database = db();
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  // A parent-change re-projects both source and destination — distinct showcase
  // docs, so run them concurrently; each keeps its own catch so one failure does
  // not cancel the other.
  await Promise.all(
    activityParentRefs(before, after).map(async (parent) => {
      const collection = parent.kind === "Program" ? "programs" : "projects";
      try {
        const snap = await database.doc(`${collection}/${parent.id}`).get();
        await projectShowcase(
          database,
          parent.kind,
          parent.id,
          snap.exists ? (snap.data() as Record<string, unknown>) : undefined,
        );
      } catch (err) {
        console.error("showcase projection failed", { id: parent.id, err });
      }
    }),
  );
});

// Inlined (mirrors @luminova/types currentTermKey) to keep the zod-laden types barrel out of this bundle path. UTC year — see docs/status/2026-06-11-k4-trigger-e2e.md.
function currentTermKey(): string {
  return String(new Date().getUTCFullYear());
}

export const onMemberWritten = onDocumentWritten("members/{id}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return; // deletes leave the Auth user untouched
  const member = parseMember(after.data());
  if (!member.uid) return; // not provisioned → no Auth user to claim
  await syncMemberClaims(firestoreClaimsDeps(db(), getAuth()), member, currentTermKey());
});

export { setUserRoles } from "./set-user-roles.js";
export { provisionMemberLogin } from "./provision-member-login.js";
