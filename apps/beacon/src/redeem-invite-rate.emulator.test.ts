import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import { clearCollections, initEmulatorTestApp } from "./award-points/emulator-harness.js";
import { firestoreRedeemDeps } from "./redeem-deps.js";
import { hashInviteToken } from "./invite-token.js";
import { createRateGate, describeInviteFor, type RedeemDeps } from "./redeem-invite.js";
import { createRateLimiter } from "./rate-limit.js";

// THE RATE GATE AGAINST THE REAL FIRESTORE.
//
// The unit suite proves the gate refuses; here the adapter, the document and the transaction
// driver are all real, so the gate is exercised against real latency and a real document
// rather than a hand-fed fake.
//
// ON PROVING "A REFUSAL ISSUES NO READ". A Firestore read has no observable side effect, so
// there is no way to detect one from the outside — an earlier draft of this file claimed the
// point could be proved by DELETING the invite document mid-throttle and showing the refusal
// still said `invite-too-many-attempts`. That proves nothing: move the gate after the read and
// the test still passes, because the read returns null and the gate is consulted before the
// null check. Counting is the only honest instrument. So `countingDeps` wraps the REAL
// adapter's `getInvite` — the read it performs is a genuine emulator round trip, and only the
// tally is added.
//
// `describeInviteFor` is the subject because it needs no Auth — `redeemInviteFor`'s account
// lookup and password write keep their coverage in the unit suite, where Auth is a port. The
// emulator boots Firestore only.

const { app, db } = initEmulatorTestApp();
const NO_AUTH = {} as Auth;

const TOKEN = "r".repeat(43);
const HASH = hashInviteToken(TOKEN);
const NOW = Date.now();

async function seedLiveInvite(): Promise<void> {
  await db.doc(`members/m1`).set({
    name: "Ana Pérez",
    email: "ana@jcioriente.bo",
    active: true,
    uid: "u1",
  });
  await db.doc(`memberInvites/${HASH}`).set({
    memberId: "m1",
    uid: "u1",
    email: "ana@jcioriente.bo",
    kind: "initial",
    issuedBy: "admin-uid",
    issuedByAdmin: true,
    status: "pending",
    issuedAt: new Date(NOW - 5000),
    expiresAt: new Date(NOW + 60 * 60_000),
  });
}

/** The REAL adapter plus a gate, on an injectable clock so the refill boundary is exact
 *  instead of depending on how long the emulator took to answer. */
function realDeps(clock: () => number, gate = createRateGate()): RedeemDeps {
  return { ...firestoreRedeemDeps(db, NO_AUTH), gate, now: clock };
}

/** The real deps with a tally around the real `getInvite`. The wrapper adds counting and
 *  nothing else: every call it forwards is a live emulator read. */
function countingDeps(clock: () => number, gate = createRateGate()) {
  const base = realDeps(clock, gate);
  const reads: string[] = [];
  const deps: RedeemDeps = {
    ...base,
    getInvite: async (hash) => {
      reads.push(hash);
      return base.getInvite(hash);
    },
  };
  return { deps, reads };
}

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (err) {
    const details = (err as { details?: { reason?: string } }).details;
    return details?.reason ?? "untagged";
  }
}

beforeEach(async () => {
  await clearCollections(db, ["memberInvites", "members"]);
  await seedLiveInvite();
});
afterAll(async () => {
  await deleteApp(app);
});

describe("invite rate gate (emulator)", () => {
  it("serves 5 real reads of a live invite, then throttles the 6th", async () => {
    const deps = realDeps(() => NOW);

    for (let i = 0; i < 5; i += 1) {
      await expect(describeInviteFor(deps, { token: TOKEN })).resolves.toMatchObject({
        email: "ana@jcioriente.bo",
        name: "Ana Pérez",
      });
    }
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );
  });

  it("issues NO Firestore read for a throttled call", async () => {
    const { deps, reads } = countingDeps(() => NOW);
    for (let i = 0; i < 5; i += 1) await describeInviteFor(deps, { token: TOKEN });
    expect(reads).toHaveLength(5);

    for (let i = 0; i < 10; i += 1) {
      expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
        "invite-too-many-attempts",
      );
    }
    // Ten throttled calls, still five reads. This is the whole economic argument: a refusal
    // must cost less than the work it prevents, or the limiter becomes the cheapest way to
    // run up a Firestore bill on an endpoint anyone can invoke.
    expect(reads).toHaveLength(5);
  });

  it("does read again once the bucket refills — the paired positive", async () => {
    // Without this, the test above would also pass for a gate that never reads at all.
    let clock = NOW;
    const { deps, reads } = countingDeps(() => clock);
    for (let i = 0; i < 5; i += 1) await describeInviteFor(deps, { token: TOKEN });
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );
    expect(reads).toHaveLength(5);

    // 5 per 60 s refills one slot every 12 s.
    clock = NOW + 12_000;
    await expect(describeInviteFor(deps, { token: TOKEN })).resolves.toMatchObject({
      email: "ana@jcioriente.bo",
    });
    expect(reads).toHaveLength(6);
  });

  it("keeps a live invite REDEEMABLE for a second invitee while another token is throttled", async () => {
    // The per-token bucket must never deny a different person. Both tokens resolve against the
    // real collection; only the hammered one is refused.
    const otherToken = "s".repeat(43);
    const otherHash = hashInviteToken(otherToken);
    await db.doc(`members/m2`).set({
      name: "Beto Ruiz",
      email: "beto@jcioriente.bo",
      active: true,
      uid: "u2",
    });
    await db.doc(`memberInvites/${otherHash}`).set({
      memberId: "m2",
      uid: "u2",
      email: "beto@jcioriente.bo",
      kind: "initial",
      issuedBy: "admin-uid",
      issuedByAdmin: true,
      status: "pending",
      issuedAt: new Date(NOW - 5000),
      expiresAt: new Date(NOW + 60 * 60_000),
    });

    const deps = realDeps(() => NOW);
    for (let i = 0; i < 6; i += 1) await reasonOf(describeInviteFor(deps, { token: TOKEN }));
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );

    await expect(describeInviteFor(deps, { token: otherToken })).resolves.toMatchObject({
      email: "beto@jcioriente.bo",
    });
  });

  it("bounds a flood of distinct tokens against the real collection", async () => {
    // The per-token bucket cannot help here — every random token gets a fresh one. Only the
    // endpoint-wide bucket stops it, and each refusal must cost no Firestore read.
    const perToken = createRateLimiter({ capacity: 5, windowMs: 60_000, maxKeys: 2048 });
    const global = createRateLimiter({ capacity: 8, windowMs: 60_000, maxKeys: 1 });
    const { deps, reads } = countingDeps(() => NOW, {
      admitGlobal: (nowMs) => global.tryConsume("*", nowMs),
      admitToken: (hash, nowMs) => perToken.tryConsume(hash, nowMs),
      // Unsampled: this test counts READS, and suppressing a log line must not be confusable
      // with suppressing a refusal.
      shouldLogRefusal: () => true,
    });

    const reasons: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      reasons.push(await reasonOf(describeInviteFor(deps, { token: `flood-${i}`.repeat(4) })));
    }
    expect(reasons.filter((r) => r === "invite-invalid")).toHaveLength(8);
    expect(reasons.filter((r) => r === "invite-too-many-attempts")).toHaveLength(12);
    // Twelve floods' worth of reads never reached Firestore.
    expect(reads).toHaveLength(8);

    // And the endpoint-wide bucket is shared, so a throttled flood also locks out the LIVE
    // token — the availability trade stated plainly rather than discovered in production.
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );
  });
});
