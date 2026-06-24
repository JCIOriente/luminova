import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Participation } from "@luminova/types/engine";
import { createFirestoreStore } from "./firestore-store.js";
import { processCheckIn } from "./process.js";
import type { CheckIn } from "./check-in.js";

// Runs against the Firestore emulator (FIRESTORE_EMULATOR_HOST set by
// `firebase emulators:exec`). Exercises the REAL admin-SDK store, so the
// aggregate read+write is genuinely concurrent here — unlike the in-memory
// fakes, which serialize every await and cannot express a race.
// Fail closed: the admin SDK silently targets PROD if the emulator host is
// unset, so refuse to run outside `pnpm test:emulator`.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "recompute-race.emulator.test must run via `pnpm test:emulator` — FIRESTORE_EMULATOR_HOST is unset.",
  );
}
const app = initializeApp({ projectId: "demo-beacon-test" });
const db = getFirestore(app);
const store = createFirestoreStore(db);

const TERM = "2026";
const M = "m1";
const TS = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function confirmedRow(id: string, pts: number): Participation {
  return {
    id,
    memberId: M,
    termId: TERM,
    activityId: id,
    parentType: null,
    parentId: null,
    role: "Attendee",
    pointRuleCode: "AttendAssembly",
    basePoints: pts,
    punctualityFactor: 1,
    computedPoints: pts,
    monthBucket: "2026-06",
    state: "confirmed",
    gates: { attendanceRegistered: true, finalReportFiled: true },
    checkInAt: TS,
    voidReason: null,
    createdAt: TS,
  };
}

// Delays every Firestore read (the participations query AND any transaction
// read) so a recompute reads an early snapshot but writes late — the ordering
// that turns the lost-update window into a permanent corruption. A non-atomic
// read-then-write loses the concurrently-added row under this; a transactional
// recompute detects the conflict, retries, and re-reads.
function slowReadsDb(real: Firestore, delayMs: number): Firestore {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const wrapQuery = (q: any): any =>
    new Proxy(q, {
      get(t, p) {
        if (p === "where") return (...a: unknown[]) => wrapQuery(t.where(...a));
        if (p === "get")
          return async () => {
            const r = await t.get();
            await sleep(delayMs);
            return r;
          };
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const wrapTx = (tx: any): any =>
    new Proxy(tx, {
      get(t, p) {
        if (p === "get")
          return async (ref: unknown) => {
            const r = await t.get(ref);
            await sleep(delayMs);
            return r;
          };
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  return new Proxy(real, {
    get(t, p) {
      if (p === "collection")
        return (name: string) =>
          name === "participations" ? wrapQuery(t.collection(name)) : t.collection(name);
      if (p === "runTransaction")
        return (fn: (tx: unknown) => unknown, opts?: unknown) =>
          (t as any).runTransaction((tx: unknown) => fn(wrapTx(tx)), opts);
      const v = Reflect.get(t, p, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  }) as Firestore;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

async function clear(name: string): Promise<void> {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

beforeEach(async () => {
  await Promise.all(["participations", "memberPoints", "members", "activities"].map(clear));
});

afterAll(async () => {
  await deleteApp(app);
});

describe("recomputeAggregate concurrency (emulator)", () => {
  it("a stale recompute cannot overwrite a fresher aggregate", async () => {
    const slow = createFirestoreStore(slowReadsDb(db, 800));

    await db.doc("participations/p0").set(confirmedRow("p0", 4));

    // A: reads the rows early (sees only p0), but its write lands last.
    const a = slow.recomputeAggregate(M, TERM);

    await sleep(100);
    await db.doc("participations/p1").set(confirmedRow("p1", 4));

    // B: reads [p0, p1] and writes 8 while A is still mid-flight.
    await store.recomputeAggregate(M, TERM);

    await a; // must serialize: A re-reads and writes 8, never clobbers with a stale 4.

    const agg = (await db.doc(`memberPoints/${M}__${TERM}`).get()).data();
    const member = (await db.doc(`members/${M}`).get()).data();
    expect(agg?.cumulative).toBe(8);
    expect(agg?.byMonth).toEqual({ "2026-06": 8 });
    expect(member?.totalPoints).toBe(8);
  });

  it("end-to-end: a check-in through the real store derives + persists the aggregate", async () => {
    await db.doc("activities/a0").set({
      termId: TERM,
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: TS,
    });
    const checkIn: CheckIn = { memberId: M, activityId: "a0", role: "Attendee", checkInAt: TS };

    await processCheckIn(store, checkIn);

    // AttendAssembly default = 4, on-time → factor 1.
    const agg = (await db.doc(`memberPoints/${M}__${TERM}`).get()).data();
    expect(agg?.cumulative).toBe(4);
    expect((await db.doc(`members/${M}`).get()).data()?.totalPoints).toBe(4);
  });
});
