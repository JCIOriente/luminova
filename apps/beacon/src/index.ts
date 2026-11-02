import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { ENFORCE_APP_CHECK, APP_CHECK_ENFORCED_CALLABLES } from "./token-verification-bypass.js";
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
  isProjectable,
  profileIdsToSync,
} from "./showcase/project-initiative.js";
import { syncShowcase } from "./showcase/sync-initiative.js";
import { projectAlly } from "./showcase/project-ally.js";
import {
  projectBoard,
  currentCargoId,
  toBoardCargo,
  type BoardCargo,
} from "./showcase/project-board.js";
import { memberProjectionUnchanged } from "./showcase/project-member.js";
import { syncMemberShowcase } from "./showcase/sync-member.js";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "./callable-auth.js";
import { guardedOnCall } from "./guarded-on-call.js";
import {
  needsPublicProfileDefault,
  PUBLIC_PROFILE_DEFAULT,
} from "./showcase/default-public-profile.js";
import { firestoreClaimsDeps, logError } from "./claims-sync/firestore-deps.js";
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

// Its own trigger, not a step of initiativeTrigger, so a failed takedown is redelivered without
// re-running the points engine. retry:true + rethrow: the delete branch is how an un-finalized
// or deleted initiative leaves the public site, and a swallowed failure there leaves it up with
// only a log line. No malformed input can fail permanently, so there is no retry storm to guard
// against: projectInitiative and rosterMemberIds are no-throw on bad data. syncShowcase decides
// from the live doc, so a late redelivery cannot republish anything.
function initiativeShowcaseTrigger(collection: "programs" | "projects") {
  const kind = collection === "programs" ? "Program" : "Project";
  return onDocumentWritten({ document: `${collection}/{id}`, retry: true }, async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    // Drafts are most initiative writes. Neither side public means no showcase to touch.
    if (![before, after].some((side) => side !== undefined && isProjectable(side))) return;
    try {
      await syncShowcase(db(), kind, event.params.id);
    } catch (err) {
      console.error("showcase projection failed", { id: event.params.id, err });
      throw err;
    }
  });
}

export const onProgramShowcaseWritten = initiativeShowcaseTrigger("programs");
export const onProjectShowcaseWritten = initiativeShowcaseTrigger("projects");

// retry:true + rethrow: removing a photo is a public takedown too, and syncShowcase's
// transaction can abort while the parent initiative is being written.
export const onActivityWritten = onDocumentWritten(
  { document: "activities/{id}", retry: true },
  async (event) => {
    const database = db();
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    // awardPoints mirrors hasCheckIns onto activities on every check-in write; skip
    // the re-projection when nothing the showcase consumes changed.
    if (activityProjectionUnchanged(before, after)) return;
    // A parent-change re-projects both source and destination — distinct showcase
    // docs, so run them concurrently; allSettled so one failure does not cancel the other.
    const results = await Promise.allSettled(
      activityParentRefs(before, after).map(async (parent) => {
        const collection = parent.kind === "Program" ? "programs" : "projects";
        const snap = await database.doc(`${collection}/${parent.id}`).get();
        // Only re-project when the parent actually exists. A missing parent means
        // either the activity's `parentType` is forged (pointing at the wrong
        // collection) or the parent was deleted — in both cases deleting `showcase/id`
        // here would clobber a doc this trigger doesn't own (the initiative's own
        // delete-trigger handles showcase cleanup on real deletion).
        if (!snap.exists) return;
        await syncShowcase(database, parent.kind, parent.id);
      }),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error("showcase projection failed", { id: event.params.id, failed });
      throw new Error(`showcase projection failed for ${failed.length} parent(s)`);
    }
  },
);

export const onMemberWritten = onDocumentWritten("members/{id}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return; // deletes leave the Auth user untouched
  const member = parseMember(after.data(), { memberId: event.params.id, logError });
  if (!member.uid) return; // not provisioned → no Auth user to claim
  await syncMemberClaims(firestoreClaimsDeps(db(), getAuth()), member, currentTermKey());
});

// Stamp the org-wide publicProfile default on a brand-new member. It lives here, not in
// the client mapper, because firestore.rules forbids `publicProfile` on create from every
// client — a creator able to set it could author a doc with someone else's name and a
// portrait it uploads, publishing a person who never consented. The member owns the flag
// from /me onward, so this only ever fires on the create itself, and only when the key is
// absent (an explicit value is a decision already made). The resulting update re-fires
// onDocumentWritten triggers, not this one, so there is no write loop.
// retry:true — unlike the projections this copies, it fires ONCE (on create) and never
// again, so a swallowed transient failure would strand that member without a default
// permanently and invisibly. Redelivery is safe: the transaction re-checks the LIVE doc,
// so a stamp that already landed, a member who has since opted out, and a doc that was
// deleted are all no-ops rather than retry fodder.
export const onMemberCreated = onDocumentCreated(
  { document: "members/{id}", retry: true },
  async (event) => {
    const created = event.data;
    if (!created || !needsPublicProfileDefault(created.data())) return;
    try {
      const ref = created.ref;
      // Re-read inside a transaction rather than trusting the create snapshot: delivery
      // is at-least-once and can be arbitrarily delayed, so by now the member may have
      // opted out from /me. Deciding off the stale snapshot would re-publish them.
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || !needsPublicProfileDefault(snap.data())) return;
        tx.update(ref, { publicProfile: PUBLIC_PROFILE_DEFAULT });
      });
    } catch (err) {
      console.error("publicProfile default stamp failed", { id: event.params.id, err });
      throw err;
    }
  },
);

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
    // START line, before the loop. The aggregate line below is conditional, so a 540 s
    // TIMEOUT — the documented way this fan-out strands members (apps/beacon/CLAUDE.md,
    // BLAST RADIUS) — used to log nothing at all, byte-for-byte indistinguishable from a
    // clean run. With this, a start without a matching completion is itself the alertable
    // signal. Counts only, no member identity: no PII.
    console.info("onRoleWritten fan-out starting", {
      roleId: event.params.id,
      builtInKey,
      members: docs.length,
    });
    let scanned = 0;
    let failed = 0;
    for (const doc of docs) {
      const member = parseMember(doc.data(), { memberId: doc.id, logError });
      if (!member.uid) continue;
      scanned += 1;
      try {
        await syncMemberClaims(deps, member, termKey);
      } catch (err) {
        failed += 1;
        console.error("onRoleWritten member re-sync failed", { memberId: doc.id, err });
      }
    }
    // The deps memo served every member above from ONE built-in role read taken at the top
    // of this invocation, and this handler can run for 540 s. Re-read once now: if a role
    // doc changed under the fan-out, some members were written from a stale snapshot and —
    // retry:false, no later trigger — nothing else will ever correct them. See the long
    // comment on builtInDocsCache in claims-sync/firestore-deps.ts. One extra query.
    const staleRoleKeys = await deps.staleBuiltInRoleKeys();
    // ONE aggregate line for the whole fan-out. The per-member logs above are the only
    // record otherwise, and with retry:false there is no redelivery: a partial fan-out
    // needs a single event an alert can key on, and the counts are what tell "one bad
    // member" apart from "the scan mostly failed". Silent on a clean run so the line
    // itself is the signal. Operator response for BOTH conditions: recomputeAllClaims.
    if (failed > 0 || staleRoleKeys.length > 0) {
      console.error("onRoleWritten fan-out incomplete — run recomputeAllClaims", {
        roleId: event.params.id,
        scanned,
        failed,
        staleRoleKeys,
      });
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

/** The project id the portrait-URL allowlist pins against. Resolved from the same place
 *  the admin SDK gets it, then the two env spellings the runtime may use — `db()` can be
 *  perfectly healthy while any single one of these is unset. Empty means "cannot decide",
 *  which the caller must NOT spell as "unpublish everyone". */
function boardProjectId(): string {
  return (
    getApp().options.projectId ??
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    ""
  );
}

async function readCargo(
  database: Firestore,
  cargoId: string,
  tx: FirebaseFirestore.Transaction,
): Promise<BoardCargo | null> {
  const snap = await tx.get(database.doc(`positions/${cargoId}`));
  return snap.exists ? toBoardCargo(snap) : null;
}

// Curated public projection: mirror a member write into the world-read boardShowcase
// collection (public fields only — name + gender-aware role + group + Storage photo
// URL), or delete it when the member is no longer publicly showable (opted out, no
// current-term CEL/JDL cargo, soft-deleted). Separate from onMemberWritten (claims
// sync) to isolate concerns. grants/PII never leave /members — only public fields are
// projected.
//
// The whole projection runs in a transaction that reads the LIVE member doc, and the
// event payload is used for nothing but the doc id. Gen2 triggers carry no cross-event
// ordering guarantee, so deciding from the payload — or reading it outside a transaction
// and writing after — lets a late or concurrent invocation re-publish a member from stale
// state, silently undoing an opt-out or an Admin takedown until the next member write.
// The transaction aborts and re-runs if the member doc changes before commit, so the last
// committed state always wins.
//
// retry:true + rethrow: the delete branch IS the takedown path, and a swallowed transient
// failure there leaves someone on the public site with only a log line. No malformed input
// can fail permanently here — projectBoard returns null rather than throwing, and
// currentCargoId already rejects empty/slash-bearing cargo ids — so there is no
// retry-storm class to protect against.
export const onBoardMemberWritten = onDocumentWritten(
  { document: "members/{id}", retry: true },
  async (event) => {
    try {
      // Without a project id no portrait URL can match, so EVERY member would project to
      // null and each member write would delete one more person from the public page —
      // silently, and with no re-projection mechanism to restore them. Skip instead:
      // "cannot decide" must never be spelled "take everyone down".
      const projectId = boardProjectId();
      if (projectId.length === 0) {
        console.error("boardShowcase projection skipped: no project id", {
          id: event.params.id,
        });
        return;
      }
      const database = db();
      const showcaseRef = database.doc(`boardShowcase/${event.params.id}`);
      const memberRef = database.doc(`members/${event.params.id}`);
      await database.runTransaction(async (tx) => {
        const live = await tx.get(memberRef);
        const member = live.exists ? (live.data() as Record<string, unknown>) : null;
        const cargoId = member ? currentCargoId(member, currentTermKey()) : null;
        const cargo = cargoId ? await readCargo(database, cargoId, tx) : null;
        const item = member ? projectBoard(event.params.id, member, cargo, projectId) : null;
        if (!item) {
          tx.delete(showcaseRef);
          return;
        }
        tx.set(showcaseRef, item);
      });
      if (!memberProjectionUnchanged(event.data?.before?.data(), event.data?.after?.data())) {
        await syncMemberShowcase(database, event.params.id, projectId);
      }
    } catch (err) {
      console.error("boardShowcase projection failed", { id: event.params.id, err });
      throw err;
    }
  },
);

// A lost sync here would leave a removed project on a public profile.
// retry:true + rethrow is safe because syncMemberShowcase decides from live docs, so a late
// redelivery cannot republish anything. allSettled so one contended member cannot strand the
// rest of the roster.
export const onShowcaseWritten = onDocumentWritten(
  { document: "showcase/{id}", retry: true, timeoutSeconds: 120 },
  async (event) => {
    const memberIds = profileIdsToSync(event.data?.before?.data(), event.data?.after?.data());
    if (memberIds.length === 0) return;
    const projectId = boardProjectId();
    if (projectId.length === 0) throw new Error("memberShowcase sync skipped: no project id");
    const database = db();
    const results: PromiseSettledResult<void>[] = [];
    for (const batch of chunk(memberIds, 10)) {
      results.push(
        ...(await Promise.allSettled(
          batch.map((id) => syncMemberShowcase(database, id, projectId)),
        )),
      );
    }
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error("memberShowcase sync failed", { id: event.params.id, failed });
      throw new Error(`memberShowcase sync failed for ${failed.length} member(s)`);
    }
  },
);

const REPROJECT_SCAN_CAP = 5000;

/** Admin-only backfill, called by hand once after the first deploy: stamps member ids on
 *  existing `showcase` docs, then builds every `memberShowcase` doc from them. In that order,
 *  because a profile finds its projects through `showcase.memberIds`. Per-doc failures are
 *  collected, so re-running is the response to a non-empty `failed`. */
export const reprojectPublicProfiles = guardedOnCall(
  { name: "reprojectPublicProfiles", timeoutSeconds: 540 },
  async (request) => {
    requireAdmin(request);
    const projectId = boardProjectId();
    if (projectId.length === 0) {
      throw new HttpsError("failed-precondition", "No project id.");
    }
    const database = db();
    const failed: string[] = [];
    let showcases = 0;
    let truncated = false;
    for (const [collection, kind] of [
      ["programs", "Program"],
      ["projects", "Project"],
    ] as const) {
      const snap = await database
        .collection(collection)
        .where("status", "==", "Finalizado")
        .limit(REPROJECT_SCAN_CAP)
        .select()
        .get();
      truncated ||= snap.size === REPROJECT_SCAN_CAP;
      for (const batch of chunk(snap.docs, 10)) {
        await Promise.all(
          batch.map(async (doc) => {
            try {
              await syncShowcase(database, kind, doc.id);
              showcases += 1;
            } catch (err) {
              console.error("showcase reprojection failed", { id: doc.id, err });
              failed.push(doc.id);
            }
          }),
        );
      }
    }
    // The scan above only reaches live finalized initiatives, so a showcase stranded by an older
    // lost takedown has to be found from this side.
    const published = await database
      .collection("showcase")
      .limit(REPROJECT_SCAN_CAP)
      .select("kind")
      .get();
    truncated ||= published.size === REPROJECT_SCAN_CAP;
    for (const batch of chunk(published.docs, 10)) {
      await Promise.all(
        batch.map(async (doc) => {
          const kind = doc.get("kind");
          if (kind !== "Program" && kind !== "Project") return;
          try {
            await syncShowcase(database, kind, doc.id);
          } catch (err) {
            console.error("showcase reprojection failed", { id: doc.id, err });
            failed.push(doc.id);
          }
        }),
      );
    }
    const members = await database.collection("members").limit(REPROJECT_SCAN_CAP).select().get();
    truncated ||= members.size === REPROJECT_SCAN_CAP;
    let synced = 0;
    for (const batch of chunk(members.docs, 10)) {
      await Promise.all(
        batch.map(async (doc) => {
          try {
            await syncMemberShowcase(database, doc.id, projectId);
            synced += 1;
          } catch (err) {
            console.error("memberShowcase reprojection failed", { id: doc.id, err });
            failed.push(doc.id);
          }
        }),
      );
    }
    return { ok: failed.length === 0 && !truncated, truncated, showcases, members: synced, failed };
  },
);

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
export { seedRoles, recomputeAllClaims, reseedBuiltInRolePerms } from "./recompute-claims.js";
export { issueMemberInvite } from "./issue-member-invite.js";
export { describeInvite, redeemInvite } from "./redeem-invite.js";

// HERE, not in redeem-invite.ts: PROCESS-wide fact, one line per cold start, no PII/secret.
console.info("beacon: App Check enforcement resolved for the invite callables", {
  enforceAppCheck: ENFORCE_APP_CHECK,
  callables: APP_CHECK_ENFORCED_CALLABLES,
});
