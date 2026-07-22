import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { clearCollections, initEmulatorTestApp } from "../award-points/emulator-harness.js";
import { sendNotification } from "./send.js";

const { app, db } = initEmulatorTestApp();

beforeEach(async () => {
  // Inbox copies live under members/{uid}/notifications, but the member docs are at
  // members/{docId} (uid != docId) — so the inbox parents are PHANTOM (no doc). A
  // .get()-based clear only sees existing docs and would leak inbox copies across
  // tests; recursiveDelete on the collection uses listDocuments, which enumerates
  // phantom parents that have subcollections, so it reaps the whole members tree.
  await db.recursiveDelete(db.collection("members"));
  await clearCollections(db, ["pushTokens", "notifications"]);
});
afterAll(async () => {
  await deleteApp(app);
});

function member(id: string, roleIds: string[], uid = `uid-${id}`) {
  return db.doc(`members/${id}`).set({ uid, roleIds, name: id, totalPoints: 0 });
}
// Member doc id != Auth uid in production (docs use addDoc; uid is linked later as a
// field). Default the fixture uid to a value DISTINCT from the doc id so the inbox /
// token keying is exercised by uid, not doc id — a same-value uid would hide a regression.

describe("sendNotification (emulator)", () => {
  it("fans out an inbox copy to every matching member", async () => {
    await member("m1", ["ExecutiveCommittee"]);
    await member("m2", []);
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };
    await sendNotification(db, sender, "n1", {
      title: "t",
      body: "b",
      url: null,
      audience: { type: "members" },
      createdAt: Timestamp.now(),
    });
    expect((await db.doc("members/uid-m1/notifications/n1").get()).data()?.read).toBe(false);
    expect((await db.doc("members/uid-m2/notifications/n1").get()).exists).toBe(true);
    // Keyed by uid, NOT the member doc id — nothing lands under the doc-id path.
    expect((await db.doc("members/m1/notifications/n1").get()).exists).toBe(false);
  });

  it("drops unprovisioned members (no uid) from the fan-out", async () => {
    await db.doc("members/m9").set({ roleIds: [], name: "m9", totalPoints: 0 }); // no uid
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };
    await sendNotification(db, sender, "n7", {
      title: "t",
      body: "b",
      url: null,
      audience: { type: "members" },
      createdAt: Timestamp.now(),
    });
    expect((await db.doc("members/m9/notifications/n7").get()).exists).toBe(false);
  });

  it("role audience fans out only to holders", async () => {
    await member("m1", ["ExecutiveCommittee"]);
    await member("m2", ["Member"]);
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };
    await sendNotification(db, sender, "n2", {
      title: "t",
      body: "b",
      url: null,
      audience: { type: "role", roleId: "ExecutiveCommittee" },
      createdAt: Timestamp.now(),
    });
    expect((await db.doc("members/uid-m1/notifications/n2").get()).exists).toBe(true);
    expect((await db.doc("members/uid-m2/notifications/n2").get()).exists).toBe(false);
  });

  it("is idempotent — a re-send overwrites, never duplicates", async () => {
    await member("m1", []);
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };
    const doc = {
      title: "t",
      body: "b",
      url: null,
      audience: { type: "members" as const },
      createdAt: Timestamp.now(),
    };
    await sendNotification(db, sender, "n3", doc);
    await sendNotification(db, sender, "n3", doc);
    const snap = await db.collection("members/uid-m1/notifications").get();
    expect(snap.size).toBe(1);
  });

  it("everyone also collects anon pushTokens and prunes dead ones", async () => {
    await member("m1", []);
    await db.doc("members/uid-m1/fcmTokens/tokA").set({ createdAt: Timestamp.now() });
    await db.doc("pushTokens/tokB").set({ createdAt: Timestamp.now() });
    const sender = {
      sendEachForMulticast: vi.fn().mockResolvedValue({
        responses: [
          { success: true },
          { success: false, error: { code: "messaging/registration-token-not-registered" } },
        ],
      }),
    };
    await sendNotification(db, sender, "n4", {
      title: "t",
      body: "b",
      url: null,
      audience: { type: "everyone" },
      createdAt: Timestamp.now(),
    });
    const call = sender.sendEachForMulticast.mock.calls[0][0];
    expect(new Set(call.tokens)).toEqual(new Set(["tokA", "tokB"]));
    const remaining =
      (await db.collection("members/uid-m1/fcmTokens").get()).size +
      (await db.collection("pushTokens").get()).size;
    expect(remaining).toBe(1);
    expect((await db.doc("notifications/n4").get()).data()?.stats).toEqual({
      pushSent: 1,
      pushFailed: 1,
    });
  });

  it("malformed audience is a no-op (no throw, no writes)", async () => {
    await member("m1", []);
    const sender = { sendEachForMulticast: vi.fn() };
    await sendNotification(db, sender, "n5", {
      title: "t",
      body: "b",
      url: null,
      audience: { type: "bogus" },
      createdAt: Timestamp.now(),
    } as never);
    expect(sender.sendEachForMulticast).not.toHaveBeenCalled();
    expect((await db.collection("members/uid-m1/notifications").get()).size).toBe(0);
  });

  it("malformed payload (empty title) is a no-op (no throw, no writes)", async () => {
    await member("m1", []);
    const sender = { sendEachForMulticast: vi.fn() };
    await sendNotification(db, sender, "n6", {
      title: "",
      body: "b",
      url: null,
      audience: { type: "members" },
      createdAt: Timestamp.now(),
    });
    expect(sender.sendEachForMulticast).not.toHaveBeenCalled();
    expect((await db.collection("members/uid-m1/notifications").get()).size).toBe(0);
  });
});
