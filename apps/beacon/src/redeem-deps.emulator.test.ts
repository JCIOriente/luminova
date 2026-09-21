import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import { clearCollections, initEmulatorTestApp } from "./award-points/emulator-harness.js";
import { firestoreRedeemDeps } from "./redeem-deps.js";

// markInviteFailed against the REAL Firestore, because its defect class is invisible to a
// unit test: redeem-deps.test.ts fakes runTransaction, and a fake happily serves a read
// issued after a write. The real driver rejects that transaction, and markInviteFailed's own
// catch turns the rejection into a log line — so the suite stays green while the invite stays
// `used`, the operator's badge reads green, and the member has no password. That is the exact
// state this function exists to prevent, which is why the ordering is pinned here.

const { app, db } = initEmulatorTestApp();

// markInviteFailed never touches Auth; the dep factory takes it for the sibling setPassword.
const NO_AUTH = {} as Auth;

const HASH = "a".repeat(64);
const NEWER = "b".repeat(64);

beforeEach(async () => {
  await clearCollections(db, ["memberInvites", "members"]);
});
afterAll(async () => {
  await deleteApp(app);
});

// claimInvite's LOST outcomes against the real driver. The unit suite asserts how each status
// maps to an invitee-facing tag, but it feeds those statuses in by hand — so on its own it
// proves nothing about which ones the adapter can actually produce. These three cases are the
// other half: they pin that `gone` and `expired` are REACHABLE, which is what stops
// CLAIM_REFUSALS' keys from being decorative and the mapping test from passing vacuously.
describe("claimInvite lost outcomes (emulator)", () => {
  const future = () => Date.now() + 60_000;

  it("reports a purged document as `gone`, not `revoked`", async () => {
    const claim = await firestoreRedeemDeps(db, NO_AUTH).claimInvite(HASH, Date.now());
    expect(claim).toEqual({ claimed: false, status: "gone" });
  });

  it("reports an unparseable resurrected stub as `gone`", async () => {
    // Exactly what commitInviteBatch's set-with-merge leaves behind when it revokes a token
    // whose document the TTL already reaped: a status and nothing else.
    await db.doc(`memberInvites/${HASH}`).set({ status: "revoked" });

    const claim = await firestoreRedeemDeps(db, NO_AUTH).claimInvite(HASH, Date.now());

    expect(claim).toEqual({ claimed: false, status: "gone" });
  });

  it("reports a link that expired against its own read as `expired`, not `revoked`", async () => {
    await db.doc(`memberInvites/${HASH}`).set({
      memberId: "m1",
      uid: "u1",
      email: "ana@jcioriente.bo",
      kind: "initial",
      issuedByAdmin: true,
      status: "pending",
      issuedAt: new Date(Date.now() - 5000),
      expiresAt: new Date(Date.now() - 1000),
    });

    const claim = await firestoreRedeemDeps(db, NO_AUTH).claimInvite(HASH, Date.now());

    expect(claim).toEqual({ claimed: false, status: "expired" });
  });

  it("claims a live pending invite and mirrors onto the projection", async () => {
    await db.doc(`memberInvites/${HASH}`).set({
      memberId: "m1",
      uid: "u1",
      email: "ana@jcioriente.bo",
      kind: "initial",
      issuedByAdmin: true,
      status: "pending",
      issuedAt: new Date(Date.now() - 5000),
      expiresAt: new Date(future()),
    });
    await db.doc("members/m1").set({ name: "Ana", invite: { status: "pending", tokenHash: HASH } });

    const claim = await firestoreRedeemDeps(db, NO_AUTH).claimInvite(HASH, Date.now());

    expect(claim).toEqual({ claimed: true, status: "used" });
    expect((await db.doc(`memberInvites/${HASH}`).get()).get("status")).toBe("used");
    expect((await db.doc("members/m1").get()).get("invite.status")).toBe("used");
  });

  it("a second claim loses against the first", async () => {
    await db.doc(`memberInvites/${HASH}`).set({
      memberId: "m1",
      uid: "u1",
      email: "ana@jcioriente.bo",
      kind: "initial",
      issuedByAdmin: true,
      status: "pending",
      issuedAt: new Date(Date.now() - 5000),
      expiresAt: new Date(future()),
    });
    await db.doc("members/m1").set({ name: "Ana" });

    const deps = firestoreRedeemDeps(db, NO_AUTH);
    expect(await deps.claimInvite(HASH, Date.now())).toEqual({ claimed: true, status: "used" });
    expect(await deps.claimInvite(HASH, Date.now())).toEqual({ claimed: false, status: "used" });
  });
});

describe("markInviteFailed (emulator)", () => {
  it("BLOCKING: marks both the invite and its projection failed", async () => {
    await db.doc(`memberInvites/${HASH}`).set({ memberId: "m1", status: "used" });
    await db.doc("members/m1").set({ name: "Ana", invite: { status: "used", tokenHash: HASH } });

    await firestoreRedeemDeps(db, NO_AUTH).markInviteFailed(HASH);

    // Both assertions fail if the transaction threw: the catch swallows it to a log line, so
    // an unwritten doc is the ONLY observable symptom of a read-after-write regression here.
    expect((await db.doc(`memberInvites/${HASH}`).get()).get("status")).toBe("failed");
    expect((await db.doc("members/m1").get()).get("invite.status")).toBe("failed");
  });

  it("leaves a projection alone once a newer invite owns it", async () => {
    await db.doc(`memberInvites/${HASH}`).set({ memberId: "m1", status: "used" });
    await db
      .doc("members/m1")
      .set({ name: "Ana", invite: { status: "pending", tokenHash: NEWER } });

    await firestoreRedeemDeps(db, NO_AUTH).markInviteFailed(HASH);

    expect((await db.doc(`memberInvites/${HASH}`).get()).get("status")).toBe("failed");
    expect((await db.doc("members/m1").get()).get("invite.status")).toBe("pending");
    expect((await db.doc("members/m1").get()).get("invite.tokenHash")).toBe(NEWER);
  });

  it("does nothing, loudly, when the invite document itself is gone", async () => {
    // The one path that bypasses the catch below it — asserting it cannot throw is what keeps
    // the guardrail-#4 log line from being the only thing standing between this state and
    // silence.
    await expect(firestoreRedeemDeps(db, NO_AUTH).markInviteFailed(HASH)).resolves.toBeUndefined();
    expect((await db.doc(`memberInvites/${HASH}`).get()).exists).toBe(false);
  });

  it("marks the invite failed even when the member doc is gone", async () => {
    await db.doc(`memberInvites/${HASH}`).set({ memberId: "m1", status: "used" });

    await firestoreRedeemDeps(db, NO_AUTH).markInviteFailed(HASH);

    expect((await db.doc(`memberInvites/${HASH}`).get()).get("status")).toBe("failed");
  });
});
