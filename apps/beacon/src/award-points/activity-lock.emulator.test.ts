import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { syncActivityCheckInFlag } from "./activity-lock.js";
import { countTxWritesTo, slowReadsDb } from "./emulator-tx-proxies.js";

// Fail closed: the admin SDK silently targets PROD if the emulator host is
// unset, so refuse to run outside `pnpm test:emulator`.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "activity-lock.emulator.test must run via `pnpm test:emulator` — FIRESTORE_EMULATOR_HOST is unset.",
  );
}
const app = initializeApp({ projectId: "demo-beacon-test" });
const db = getFirestore(app);

const TS = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));
const ACTIVITY = {
  termId: "2026",
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: TS,
  status: "Programada",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clear(name: string): Promise<void> {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

beforeEach(async () => {
  await Promise.all(["checkIns", "activities"].map(clear));
});

afterAll(async () => {
  await deleteApp(app);
});

describe("syncActivityCheckInFlag (emulator)", () => {
  it("sets hasCheckIns:true once a check-in exists", async () => {
    await db.doc("activities/a1").set(ACTIVITY);
    await db.doc("checkIns/c1").set({ memberId: "m1", activityId: "a1", role: "Attendee" });

    await syncActivityCheckInFlag(db, "a1");

    expect((await db.doc("activities/a1").get()).data()?.hasCheckIns).toBe(true);
  });

  it("clears the flag back to false when the last check-in is deleted", async () => {
    await db.doc("activities/a1").set({ ...ACTIVITY, hasCheckIns: true });

    await syncActivityCheckInFlag(db, "a1");

    expect((await db.doc("activities/a1").get()).data()?.hasCheckIns).toBe(false);
  });

  it("counts malformed check-in docs — any doc matching activityId locks", async () => {
    await db.doc("activities/a1").set(ACTIVITY);
    // No memberId/role: validateCheckIn would reject it, but it still matches
    // the count query, so the lock must still engage.
    await db.doc("checkIns/broken").set({ activityId: "a1" });

    await syncActivityCheckInFlag(db, "a1");

    expect((await db.doc("activities/a1").get()).data()?.hasCheckIns).toBe(true);
  });

  it("always issues the flag write, even when the stored value matches (conflict anchor)", async () => {
    const counter = countTxWritesTo(db, "activities/a1");
    await db.doc("activities/a1").set({ ...ACTIVITY, hasCheckIns: true });
    await db.doc("checkIns/c1").set({ memberId: "m1", activityId: "a1", role: "Attendee" });

    const before = counter.writes();
    await syncActivityCheckInFlag(counter.db, "a1");

    expect(counter.writes()).toBeGreaterThan(before);
    expect((await db.doc("activities/a1").get()).data()?.hasCheckIns).toBe(true);
  });

  it("overwrites a non-boolean stored value with the recomputed flag", async () => {
    await db.doc("activities/a1").set({ ...ACTIVITY, hasCheckIns: "yes" });
    await db.doc("checkIns/c1").set({ memberId: "m1", activityId: "a1", role: "Attendee" });

    await syncActivityCheckInFlag(db, "a1");

    expect((await db.doc("activities/a1").get()).data()?.hasCheckIns).toBe(true);
  });

  it("a stale delete-sync cannot strand the flag against a fresher check-in", async () => {
    // Interleaving from the adversarial design review: the last check-in was just
    // deleted, its sync (D) reads count=0 but commits late; a new check-in lands and
    // its sync (C) runs to completion in between. Whatever order the transactions
    // serialize in, the unconditional flag write forces the loser to retry and
    // re-read the count — the final flag must reflect the surviving check-in.
    await db.doc("activities/a1").set({ ...ACTIVITY, hasCheckIns: true });

    const d = syncActivityCheckInFlag(slowReadsDb(db, 800), "a1");
    await sleep(100);
    await db.doc("checkIns/y").set({ memberId: "m1", activityId: "a1", role: "Attendee" });
    await syncActivityCheckInFlag(db, "a1");
    await d;

    expect((await db.doc("activities/a1").get()).data()?.hasCheckIns).toBe(true);
  });

  it("no-ops without throwing when the activity doc is missing", async () => {
    await db.doc("checkIns/orphan").set({ memberId: "m1", activityId: "ghost", role: "Attendee" });

    await syncActivityCheckInFlag(db, "ghost");

    expect((await db.doc("activities/ghost").get()).exists).toBe(false);
  });
});
