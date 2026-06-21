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
  showcasePerson,
} from "./showcase/project-initiative.js";
import { projectAlly } from "./showcase/project-ally.js";
import type { ShowcasePerson } from "@luminova/types/engine";
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

async function resolveMembers(
  database: Firestore,
  ids: string[],
): Promise<Map<string, ShowcasePerson>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  const people = new Map<string, ShowcasePerson>();
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((id) => database.doc(`members/${id}`));
    const snaps = await database.getAll(...refs);
    for (const snap of snaps) {
      const p = showcasePerson(snap.get("name"), snap.get("profilePicture"));
      if (p) people.set(snap.id, p);
    }
  }
  return people;
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
  // Independent reads — resolve names and fetch child activities concurrently.
  const [members, activitySnap] = await Promise.all([
    resolveMembers(database, rosterMemberIds(data)),
    database.collection("activities").where("parentId", "==", id).limit(ACTIVITY_ROLLUP_CAP).get(),
  ]);
  const item = projectInitiative(kind, id, data, (mid) => members.get(mid) ?? null);
  if (!item) {
    await ref.delete();
    return;
  }
  const activityPhotos = activityShowcasePhotos(
    kind,
    activitySnap.docs.map((d) => ({ id: d.id, data: d.data() })),
  );
  await ref.set({ ...item, photos: [...item.photos, ...activityPhotos] });
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
        // Only re-project when the parent actually exists. A missing parent means
        // either the activity's `parentType` is forged (pointing at the wrong
        // collection) or the parent was deleted — in both cases deleting `showcase/id`
        // here would clobber a doc this trigger doesn't own (the initiative's own
        // delete-trigger handles showcase cleanup on real deletion).
        if (!snap.exists) return;
        await projectShowcase(
          database,
          parent.kind,
          parent.id,
          snap.data() as Record<string, unknown>,
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

// Curated public projection: mirror an ally write into the world-read allyShowcase
// collection (public fields only), or delete it when the ally is no longer showable.
export const onAllyWritten = onDocumentWritten("allies/{id}", async (event) => {
  const ref = db().doc(`allyShowcase/${event.params.id}`);
  const after = event.data?.after;
  const item = after?.exists
    ? projectAlly(event.params.id, after.data() as Record<string, unknown>)
    : null;
  if (!item) {
    await ref.delete();
    return;
  }
  await ref.set(item);
});

export { setUserRoles } from "./set-user-roles.js";
export { provisionMemberLogin } from "./provision-member-login.js";
