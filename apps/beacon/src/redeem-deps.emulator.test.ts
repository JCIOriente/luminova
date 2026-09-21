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

  it("marks the invite failed even when the member doc is gone", async () => {
    await db.doc(`memberInvites/${HASH}`).set({ memberId: "m1", status: "used" });

    await firestoreRedeemDeps(db, NO_AUTH).markInviteFailed(HASH);

    expect((await db.doc(`memberInvites/${HASH}`).get()).get("status")).toBe("failed");
  });
});
