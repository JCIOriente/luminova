import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { clearCollections, initEmulatorTestApp } from "../award-points/emulator-harness.js";
import { syncMemberShowcase } from "./sync-member.js";

const { app, db } = initEmulatorTestApp();

const PROJECT = "demo-beacon-test";

const MEMBER = {
  name: "Ana Rojas",
  publicProfile: true,
  uid: "u1",
  gender: "Femenino",
  active: true,
  deletedAt: null,
  email: "ana@example.com",
  joinDate: Timestamp.fromDate(new Date("2019-03-01T00:00:00Z")),
  positions: { "2026": { cargoId: "president", comisionIds: [] } },
};

const SHOWCASE = {
  id: "p1",
  title: "Agua Segura",
  endDate: Timestamp.fromDate(new Date("2025-06-01T12:00:00Z")),
  impact: { personsImpacted: 120 },
  memberIds: ["m1"],
  team: { director: { id: "m1", name: "Ana Rojas", photoUrl: null }, coDirectors: [], members: [] },
};

beforeEach(async () => {
  await clearCollections(db, ["members", "positions", "showcase", "memberShowcase"]);
  await db.doc("positions/president").set({
    category: "CEL",
    title: "Presidente",
    titleFemale: "Presidenta",
  });
  await db.doc("showcase/p1").set(SHOWCASE);
});

afterAll(async () => {
  await deleteApp(app);
});

describe("syncMemberShowcase (emulator)", () => {
  it("joins the member's cargos and projects, without their private fields", async () => {
    await db.doc("members/m1").set(MEMBER);

    await syncMemberShowcase(db, "m1", PROJECT);

    const item = (await db.doc("memberShowcase/m1").get()).data();
    expect(item?.career).toEqual([{ year: "2026", title: "Presidenta" }]);
    expect(item?.projects).toEqual([
      { id: "p1", title: "Agua Segura", year: 2025, role: "Director", personsImpacted: 120 },
    ]);
    expect(item).not.toHaveProperty("email");
    expect(item).not.toHaveProperty("uid");
  });

  it("works for a member with no cargo at all", async () => {
    await db.doc("members/m1").set({ ...MEMBER, positions: {} });

    await syncMemberShowcase(db, "m1", PROJECT);

    expect((await db.doc("memberShowcase/m1").get()).data()?.career).toEqual([]);
  });

  it("takes the profile down on an opt-out", async () => {
    await db.doc("members/m1").set(MEMBER);
    await syncMemberShowcase(db, "m1", PROJECT);

    await db.doc("members/m1").update({ publicProfile: false });
    await syncMemberShowcase(db, "m1", PROJECT);

    expect((await db.doc("memberShowcase/m1").get()).exists).toBe(false);
  });

  it("takes the profile down when the member doc is gone", async () => {
    await db.doc("memberShowcase/m1").set({ name: "stale" });

    await syncMemberShowcase(db, "m1", PROJECT);

    expect((await db.doc("memberShowcase/m1").get()).exists).toBe(false);
  });
});
