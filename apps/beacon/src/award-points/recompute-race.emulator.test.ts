import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import type { Participation } from "@luminova/types/engine";
import { createFirestoreStore } from "./firestore-store.js";
import { processCheckIn } from "./process.js";
import type { CheckIn } from "./check-in.js";
import {
  clearCollections,
  countTxWritesTo,
  initEmulatorTestApp,
  sleep,
  slowReadsDb,
} from "./emulator-harness.js";

// Runs against the Firestore emulator (FIRESTORE_EMULATOR_HOST set by
// `firebase emulators:exec`). Exercises the REAL admin-SDK store, so the
// aggregate read+write is genuinely concurrent here — unlike the in-memory
// fakes, which serialize every await and cannot express a race.
const { app, db } = initEmulatorTestApp();
const store = createFirestoreStore(db);

const TERM = "2026";
const M = "m1";
const TS = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));

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

beforeEach(async () => {
  await clearCollections(db, ["participations", "memberPoints", "members", "activities"]);
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

  it("issues a members write only when totalPoints changes (no claims-sync amplification)", async () => {
    const counter = countTxWritesTo(db, `members/${M}`);
    const counted = createFirestoreStore(counter.db);

    // Assert deltas, not absolutes: the unchanged case must issue ZERO members
    // writes (a skip is never called on any txn attempt → retry-proof), while the
    // changed cases issue at least one (a retry could inflate the absolute count).
    await db.doc("participations/p0").set(confirmedRow("p0", 4));
    const before1 = counter.writes();
    await counted.recomputeAggregate(M, TERM); // 0 → 4: writes members (creates doc)
    expect(counter.writes()).toBeGreaterThan(before1);
    expect((await db.doc(`members/${M}`).get()).data()?.totalPoints).toBe(4);

    const before2 = counter.writes();
    await counted.recomputeAggregate(M, TERM); // unchanged (4): members write skipped
    expect(counter.writes()).toBe(before2);

    await db.doc("participations/p1").set(confirmedRow("p1", 4));
    const before3 = counter.writes();
    await counted.recomputeAggregate(M, TERM); // 4 → 8: writes members again
    expect(counter.writes()).toBeGreaterThan(before3);
    expect((await db.doc(`members/${M}`).get()).data()?.totalPoints).toBe(8);
  });
});
