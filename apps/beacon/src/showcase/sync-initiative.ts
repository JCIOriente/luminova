import type { Firestore } from "firebase-admin/firestore";
import type { InitiativeKind, ShowcasePerson } from "@luminova/types/engine";
import { chunk } from "../chunk.js";
import {
  activityShowcasePhotos,
  isProjectable,
  projectInitiative,
  rosterMemberIds,
  showcasePerson,
} from "./project-initiative.js";

// Defensive bound on the child-activity roll-up query — far above any realistic
// per-initiative activity count, but caps memory/latency on a pathological parent.
const ACTIVITY_ROLLUP_CAP = 500;

// A showcase past Firestore's 1 MiB doc limit fails on every retry and strands a takedown, and
// nothing else bounds photos across 500 activities. Far above any real gallery.
const SHOWCASE_PHOTO_CAP = 1000;

const INITIATIVE_COLLECTIONS: Record<InitiativeKind, string> = {
  Program: "programs",
  Project: "projects",
};

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
      if (p) people.set(snap.id, { ...p, id: snap.id });
    }
  }
  return people;
}

/**
 * Write or take down showcase/{id} from the LIVE initiative doc. Every caller goes through
 * here, so no event payload or stale scan can republish an initiative that was un-finalized
 * meanwhile: the transaction re-runs if the initiative changes before commit, and the last
 * committed state wins. The member and activity reads stay outside it on purpose, so a
 * projection never contends with roster or check-in writes.
 */
export async function syncShowcase(
  database: Firestore,
  kind: InitiativeKind,
  id: string,
): Promise<void> {
  const sourceRef = database.doc(`${INITIATIVE_COLLECTIONS[kind]}/${id}`);
  const showcaseRef = database.doc(`showcase/${id}`);
  await database.runTransaction(async (tx) => {
    const data = (await tx.get(sourceRef)).data();
    if (!data || !isProjectable(data)) {
      tx.delete(showcaseRef);
      return;
    }
    // Independent reads — resolve names and fetch child activities concurrently.
    const [members, activitySnap] = await Promise.all([
      resolveMembers(database, rosterMemberIds(data)),
      database
        .collection("activities")
        .where("parentId", "==", id)
        .limit(ACTIVITY_ROLLUP_CAP)
        .get(),
    ]);
    const item = projectInitiative(kind, id, data, (mid) => members.get(mid) ?? null);
    if (!item) {
      tx.delete(showcaseRef);
      return;
    }
    const activityPhotos = activityShowcasePhotos(
      kind,
      activitySnap.docs.map((d) => ({ id: d.id, data: d.data() })),
    );
    tx.set(showcaseRef, {
      ...item,
      photos: [...item.photos, ...activityPhotos].slice(0, SHOWCASE_PHOTO_CAP),
    });
  });
}
