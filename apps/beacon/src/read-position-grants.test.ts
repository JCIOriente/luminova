import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { readPositionGrants } from "./read-position-grants.js";

/** A Firestore stub narrow enough to drive `db.doc(path).get()`. The cast is test-only and
 *  justified: `readPositionGrants` touches exactly that one call chain. */
function fakeDb(docs: Record<string, Record<string, unknown> | undefined>): Firestore {
  return {
    doc: (path: string) => ({
      get: async () => {
        const data = docs[path];
        return { exists: data !== undefined, data: () => data };
      },
    }),
  } as unknown as Firestore;
}

describe("readPositionGrants", () => {
  it("returns the valid roles from a well-formed cargo", async () => {
    const db = fakeDb({ "positions/p1": { grants: ["Admin", "Membership"] } });
    await expect(readPositionGrants(db, "p1")).resolves.toEqual(["Admin", "Membership"]);
  });

  it("drops grant entries that are not valid roles", async () => {
    const db = fakeDb({ "positions/p1": { grants: ["Admin", "NotARole", 42, null] } });
    await expect(readPositionGrants(db, "p1")).resolves.toEqual(["Admin"]);
  });

  it("returns [] for an absent or empty grants field", async () => {
    const db = fakeDb({ "positions/p1": {}, "positions/p2": { grants: [] } });
    await expect(readPositionGrants(db, "p1")).resolves.toEqual([]);
    await expect(readPositionGrants(db, "p2")).resolves.toEqual([]);
  });

  it("returns null for a missing doc and for an unsafe id", async () => {
    const db = fakeDb({});
    await expect(readPositionGrants(db, "ghost")).resolves.toBeNull();
    await expect(readPositionGrants(db, "a/b")).resolves.toBeNull();
    await expect(readPositionGrants(db, "")).resolves.toBeNull();
    await expect(readPositionGrants(db, "__name__")).resolves.toBeNull();
    await expect(readPositionGrants(db, 42)).resolves.toBeNull();
  });

  it("BLOCKING: returns null instead of THROWING on a non-array grants field", async () => {
    // firestore.rules short-circuits every grants check on hasAnyRole(['Admin']) and never
    // type-checks the field, so a console edit or a migration can store one of these. A
    // TypeError here would be permanent per member: onMemberWritten is retry:false and the bad
    // value persists in positions/, so every later write to any member seated on that cargo
    // would re-throw and their claims would never sync again — silently.
    const db = fakeDb({
      "positions/str": { grants: "Admin" },
      "positions/map": { grants: { 0: "Admin" } },
      "positions/num": { grants: 7 },
      "positions/bool": { grants: true },
    });
    for (const id of ["str", "map", "num", "bool"]) {
      await expect(readPositionGrants(db, id)).resolves.toBeNull();
    }
  });
});
