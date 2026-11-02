import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { clearCollections, initEmulatorTestApp } from "../award-points/emulator-harness.js";
import { syncShowcase } from "./sync-initiative.js";

const { app, db } = initEmulatorTestApp();

const TS = Timestamp.fromDate(new Date("2025-06-01T12:00:00Z"));

const FINALIZED = {
  status: "Finalizado",
  title: "Agua Segura",
  description: "",
  category: "NegociosEmprendimiento",
  startDate: TS,
  endDate: TS,
  impact: { personsImpacted: 120, volunteers: 4, closingSummary: "x" },
  finalReport: { filedAt: TS, filedBy: "m1" },
  roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
};

beforeEach(async () => {
  await clearCollections(db, ["projects", "members", "activities", "showcase"]);
  await db.doc("members/m1").set({ name: "Ana Rojas", profilePicture: null });
});

afterAll(async () => {
  await deleteApp(app);
});

describe("syncShowcase (emulator)", () => {
  it("publishes a finalized initiative with its resolved roster", async () => {
    await db.doc("projects/p1").set(FINALIZED);

    await syncShowcase(db, "Project", "p1");

    const item = (await db.doc("showcase/p1").get()).data();
    expect(item?.memberIds).toEqual(["m1"]);
    expect(item?.team.director).toEqual({ id: "m1", name: "Ana Rojas", photoUrl: null });
  });

  it("takes the showcase down once the live initiative is no longer finalized", async () => {
    await db.doc("projects/p1").set(FINALIZED);
    await syncShowcase(db, "Project", "p1");

    await db.doc("projects/p1").update({ status: "Activo" });
    await syncShowcase(db, "Project", "p1");

    expect((await db.doc("showcase/p1").get()).exists).toBe(false);
  });

  it("takes the showcase down when the initiative is gone", async () => {
    await db.doc("showcase/p1").set({ title: "stale" });

    await syncShowcase(db, "Project", "p1");

    expect((await db.doc("showcase/p1").get()).exists).toBe(false);
  });

  it("survives a malformed roster, which would otherwise retry forever", async () => {
    await db.doc("projects/p1").set({
      ...FINALIZED,
      roster: { directorId: "m1", coDirectorIds: "not-a-list", teamIds: 7 },
    });

    await syncShowcase(db, "Project", "p1");

    expect((await db.doc("showcase/p1").get()).data()?.memberIds).toEqual(["m1"]);
  });
});
