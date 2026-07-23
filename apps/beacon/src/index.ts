import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { createFirestoreStore, parseInitiativeWrite } from "./award-points/firestore-store.js";
import { syncActivityCheckInFlag } from "./award-points/activity-lock.js";
import { checkInActivityIds, validateCheckIn } from "./award-points/check-in.js";
import {
  processCheckIn,
  processCheckInDelete,
  processCheckInUpdate,
  processInitiativeWrite,
} from "./award-points/process.js";
import {
  activityParentRefs,
  activityProjectionUnchanged,
  activityShowcasePhotos,
  isProjectable,
  projectInitiative,
  rosterMemberIds,
  showcasePerson,
} from "./showcase/project-initiative.js";
import { projectAlly } from "./showcase/project-ally.js";
import { projectBoard, currentCargoId, type BoardCargo } from "./showcase/project-board.js";
import type { ShowcasePerson } from "@luminova/types/engine";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { syncMemberClaims } from "./claims-sync/sync.js";
import { roleClaimsChanged } from "./claims-sync/role-change.js";
import { builtInKeyFromRoleDoc } from "./claims-sync/role-doc.js";
import { parseMember, MEMBER_SYNC_FIELDS } from "./claims-sync/parse-member.js";
import { currentTermKey } from "./runtime.js";
import { chunk } from "./chunk.js";
import { sendNotification } from "./notifications/send.js";

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
  for (const batch of chunk(unique, 300)) {
    const refs = batch.map((id) => database.doc(`members/${id}`));
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

// retry: true — a transient failure here MUST redeliver: the hasCheckIns mirror
// only recomputes on checkIns writes, so a swallowed/unretried error on an
// activity's first check-in would leave the rules-side lock disengaged forever
// (single-check-in activities never get a second write to self-heal on). The
// whole handler is idempotent under redelivery (deterministic participation ids,
// recompute-from-rows aggregate, recompute-from-count flag), and validateCheckIn
// rejects malformed docs by returning null — never throwing — so bad input
// cannot loop a retry storm.
export const awardPoints = onDocumentWritten(
  { document: "checkIns/{id}", retry: true },
  async (event) => {
    const store = createFirestoreStore(db());
    // .data() re-decodes the proto on every call — capture each side once.
    const beforeRaw = event.data?.before?.exists ? event.data.before.data() : undefined;
    const afterRaw = event.data?.after?.exists ? event.data.after.data() : undefined;
    if (beforeRaw !== undefined && afterRaw !== undefined) {
      // Rules deny client updates — this is the admin-SDK/console path. An
      // identity change re-keys the participation id, so the update handler
      // reconciles the old row away instead of orphaning it.
      await processCheckInUpdate(store, beforeRaw, afterRaw);
    } else if (afterRaw !== undefined) {
      const checkIn = validateCheckIn(afterRaw);
      if (checkIn !== null) await processCheckIn(store, checkIn);
    } else if (beforeRaw !== undefined) {
      const checkIn = validateCheckIn(beforeRaw);
      if (checkIn !== null) await processCheckInDelete(store, checkIn);
    }
    // Mirror check-in existence onto the activity for the rules-side field lock.
    // Runs even when validateCheckIn rejected the doc (a malformed check-in still
    // matches the count query) and after the engine work so a mirror failure never
    // pre-empts points — errors propagate on purpose so the retry redoes both.
    // An identity move re-syncs BOTH activities (the old one's count dropped) —
    // independent transactions on distinct docs, so run them concurrently.
    await Promise.all(
      checkInActivityIds(beforeRaw, afterRaw).map((activityId) =>
        syncActivityCheckInFlag(db(), activityId),
      ),
    );
  },
);

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
  // awardPoints mirrors hasCheckIns onto activities on every check-in write; skip
  // the re-projection when nothing the showcase consumes changed.
  if (activityProjectionUnchanged(before, after)) return;
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

export const onMemberWritten = onDocumentWritten("members/{id}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return; // deletes leave the Auth user untouched
  const member = parseMember(after.data());
  if (!member.uid) return; // not provisioned → no Auth user to claim
  await syncMemberClaims(firestoreClaimsDeps(db(), getAuth()), member, currentTermKey());
});

// A role's permission set changed → re-sync the custom claims of every member who
// holds it. Custom role: members whose roleIds array-contains the id. Built-in
// role: all provisioned members (rare, admin-only edit). Idempotent per member.
// Per-member try/catch isolates a single Auth failure so it can't re-trigger the
// whole fan-out (retry storm); longer timeout + projection bound the scan.
// roleClaimsChanged skips the whole members scan for metadata-only edits (or a
// redelivered no-op write) — nothing the claims depend on changed. A metadata-only
// edit therefore no longer re-drives the scan, so recomputeAllClaims (not an
// incidental rename) is the backstop for a member stranded by an earlier partial
// failure. Snapshot.data() is undefined when the doc side didn't exist (create/delete).
export const onRoleWritten = onDocumentWritten(
  { document: "roles/{id}", timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const data = afterData ?? beforeData;
    if (!data) return;
    if (!roleClaimsChanged(beforeData, afterData)) return;
    const database = db();
    const deps = firestoreClaimsDeps(database, getAuth());
    // event.time is stable across retries (unlike now()) — avoids a year-boundary
    // retry resolving positions under a different term key.
    const termKey = String(new Date(event.time).getUTCFullYear());
    // Scan by whichever side is built-in: a built-in->custom edit (builtInKey
    // removed) must still re-sync every position-holder to drop the now-removed
    // built-in perms, not fall through to the roleIds filter that misses them.
    const builtInKey = builtInKeyFromRoleDoc(afterData) ?? builtInKeyFromRoleDoc(beforeData);
    const members = database.collection("members").select(...MEMBER_SYNC_FIELDS);
    const query = builtInKey
      ? members
      : members.where("roleIds", "array-contains", event.params.id);
    const { docs } = await query.get();
    for (const doc of docs) {
      const member = parseMember(doc.data());
      if (!member.uid) continue;
      try {
        await syncMemberClaims(deps, member, termKey);
      } catch (err) {
        console.error("onRoleWritten member re-sync failed", { memberId: doc.id, err });
      }
    }
  },
);

// Curated public projection: mirror an ally write into the world-read allyShowcase
// collection (public fields only), or delete it when the ally is no longer showable.
export const onAllyWritten = onDocumentWritten("allies/{id}", async (event) => {
  // Swallow + log: a permanent Firestore error (bad id, permission) must not throw
  // and trigger an at-least-once retry storm. The projection self-heals on the next
  // write to the ally. Mirrors the projectShowcase error handling above.
  try {
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
  } catch (err) {
    console.error("allyShowcase projection failed", { id: event.params.id, err });
  }
});

async function readCargo(database: Firestore, cargoId: string): Promise<BoardCargo | null> {
  const snap = await database.doc(`positions/${cargoId}`).get();
  if (!snap.exists) return null;
  return {
    category: snap.get("category"),
    title: snap.get("title"),
    titleFemale: snap.get("titleFemale"),
  };
}

// Curated public projection: mirror a member write into the world-read boardShowcase
// collection (public fields only — name + gender-aware role + group + Storage photo
// URL), or delete it when the member is no longer publicly showable (opted out, no
// current-term CEL/JDL cargo, soft-deleted). Separate from onMemberWritten (claims
// sync) to isolate concerns. Swallow + log like onAllyWritten: a permanent Firestore
// error must not trigger an at-least-once retry storm; self-heals on the next member
// write. grants/PII never leave /members — only public fields are projected.
export const onBoardMemberWritten = onDocumentWritten("members/{id}", async (event) => {
  try {
    const database = db();
    const ref = database.doc(`boardShowcase/${event.params.id}`);
    const after = event.data?.after;
    if (!after?.exists) {
      await ref.delete();
      return;
    }
    const member = after.data() as Record<string, unknown>;
    const cargoId = currentCargoId(member, currentTermKey());
    const cargo = cargoId ? await readCargo(database, cargoId) : null;
    const item = projectBoard(event.params.id, member, cargo);
    if (!item) {
      await ref.delete();
      return;
    }
    await ref.set(item);
  } catch (err) {
    console.error("boardShowcase projection failed", { id: event.params.id, err });
  }
});

// Compose = create of notifications/{id}. Fan out inbox copies + best-effort FCM.
// retry:false (the onDocumentCreated default, stated for intent) — push is not
// idempotent (a redeliver would double-notify); sendNotification swallows push
// failures so a transient FCM error never throws a retry. The inbox fan-out is
// idempotent (deterministic doc id) if a redelivery ever occurs anyway.
export const onNotificationCreated = onDocumentCreated(
  { document: "notifications/{id}", retry: false },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    await sendNotification(db(), getMessaging(), event.params.id, {
      title: data.title,
      body: data.body,
      url: data.url ?? null,
      audience: data.audience,
      createdAt: data.createdAt,
    });
  },
);

export { setUserRoles } from "./set-user-roles.js";
export { seedRoles, recomputeAllClaims } from "./recompute-claims.js";
export { provisionMemberLogin } from "./provision-member-login.js";
