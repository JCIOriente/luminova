import { describe, it, expect } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { createFirestoreStore, parseInitiativeWrite } from "./firestore-store.js";

/**
 * Minimal in-memory stand-in for the admin Firestore handle: enough of the
 * `db.doc(path).get()/.set()` surface for the direction-uid mirror tests, with a
 * `writes` log so a test can assert no write happened (the loop-termination guard).
 */
class FakeFirestore {
  docs = new Map<string, Record<string, unknown>>();
  writes: { path: string; data: Record<string, unknown> }[] = [];

  doc(path: string) {
    return {
      get: async () => {
        const data = this.docs.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        this.writes.push({ path, data });
        const prev = opts?.merge ? (this.docs.get(path) ?? {}) : {};
        this.docs.set(path, { ...prev, ...data });
      },
    };
  }

  asFirestore(): Firestore {
    return this as unknown as Firestore;
  }
}

describe("parseInitiativeWrite", () => {
  it("parses a roster + filed report into millis", () => {
    const filedAt = Timestamp.fromDate(new Date("2026-09-01T00:00:00Z"));
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorIds: ["c1"], teamIds: ["t1"] },
      finalReport: { filedAt, filedBy: "u1" },
    });
    expect(out).toEqual({
      termId: "2026",
      roster: { directorId: "d1", coDirectorIds: ["c1"], teamIds: ["t1"] },
      reportFiled: true,
      filedAtMillis: filedAt.toMillis(),
    });
  });

  it("treats a null finalReport as not filed", () => {
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorIds: [], teamIds: [] },
      finalReport: null,
    });
    expect(out?.reportFiled).toBe(false);
    expect(out?.filedAtMillis).toBeNull();
  });

  it("returns null when termId is missing", () => {
    expect(
      parseInitiativeWrite({ roster: { directorId: "d1", coDirectorIds: [], teamIds: [] } }),
    ).toBeNull();
  });

  it("defaults a missing roster to empty (so deletes still reconcile)", () => {
    const out = parseInitiativeWrite({ termId: "2026" });
    expect(out?.roster).toEqual({ directorId: "", coDirectorIds: [], teamIds: [] });
  });

  it("rejects a termId that would break the composite id (/ or __)", () => {
    expect(parseInitiativeWrite({ termId: "a/b" })).toBeNull();
    expect(parseInitiativeWrite({ termId: "a__b" })).toBeNull();
  });

  it("drops roster member ids that aren't path-safe", () => {
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d/1", coDirectorIds: ["c__1"], teamIds: ["ok", "bad__id", "a/b"] },
    });
    expect(out?.roster).toEqual({ directorId: "", coDirectorIds: [], teamIds: ["ok"] });
  });

  it("parses coDirectorIds and drops unclean ids", () => {
    const init = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "m1", coDirectorIds: ["m2", "bad__id", "a/b"], teamIds: [] },
    });
    expect(init?.roster.coDirectorIds).toEqual(["m2"]);
  });

  it("tolerates non-object input", () => {
    expect(parseInitiativeWrite(undefined)).toBeNull();
    expect(parseInitiativeWrite(null)).toBeNull();
  });

  it("dedupes a co-director id repeated in the array", () => {
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorIds: ["m2", "m2", "m3"], teamIds: [] },
    });
    expect(out?.roster.coDirectorIds).toEqual(["m2", "m3"]);
  });
});

describe("createFirestoreStore — directionUids mirror", () => {
  it("setInitiativeDirectionUids writes sorted uids when they differ", async () => {
    const db = new FakeFirestore();
    db.docs.set("projects/p1", { termId: "2026" });
    const store = createFirestoreStore(db.asFirestore());
    await store.setInitiativeDirectionUids("Project", "p1", ["u2", "u1"]);
    expect(db.writes).toEqual([{ path: "projects/p1", data: { directionUids: ["u1", "u2"] } }]);
    expect(db.docs.get("projects/p1")).toEqual({ termId: "2026", directionUids: ["u1", "u2"] });
  });

  it("setInitiativeDirectionUids skips the write when sorted uids are unchanged", async () => {
    const db = new FakeFirestore();
    db.docs.set("projects/p1", { directionUids: ["u1", "u2"] });
    const store = createFirestoreStore(db.asFirestore());
    await store.setInitiativeDirectionUids("Project", "p1", ["u2", "u1"]);
    expect(db.writes).toEqual([]); // loop-termination guard: identical → no write
  });

  it("setInitiativeDirectionUids writes [] to clear stale uids when the roster is emptied", async () => {
    const db = new FakeFirestore();
    db.docs.set("projects/p1", { directionUids: ["u1"] });
    const store = createFirestoreStore(db.asFirestore());
    await store.setInitiativeDirectionUids("Project", "p1", []);
    expect(db.writes).toEqual([{ path: "projects/p1", data: { directionUids: [] } }]);
  });

  it("setInitiativeDirectionUids targets the programs collection for Program", async () => {
    const db = new FakeFirestore();
    db.docs.set("programs/g1", {});
    const store = createFirestoreStore(db.asFirestore());
    await store.setInitiativeDirectionUids("Program", "g1", ["u1"]);
    expect(db.writes).toEqual([{ path: "programs/g1", data: { directionUids: ["u1"] } }]);
  });

  it("setInitiativeDirectionUids no-ops when the doc is missing", async () => {
    const db = new FakeFirestore();
    const store = createFirestoreStore(db.asFirestore());
    await store.setInitiativeDirectionUids("Project", "ghost", ["u1"]);
    expect(db.writes).toEqual([]);
  });

  it("getMemberUids skips members without a uid", async () => {
    const db = new FakeFirestore();
    db.docs.set("members/m1", { uid: "u1" });
    db.docs.set("members/m9", {});
    const store = createFirestoreStore(db.asFirestore());
    expect(await store.getMemberUids(["m1", "m9"])).toEqual(["u1"]);
  });

  it("getMemberUids skips members whose doc is missing", async () => {
    const db = new FakeFirestore();
    db.docs.set("members/m1", { uid: "u1" });
    const store = createFirestoreStore(db.asFirestore());
    expect(await store.getMemberUids(["m1", "gone"])).toEqual(["u1"]);
  });
});
