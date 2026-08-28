import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // Every null return logs (see below), so the anomaly cases here would otherwise spray
  // stderr across the run. Stubbed for all of them; the two tests that assert on it read
  // this same spy.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("logs every null — none of them is visible to either caller otherwise", async () => {
    // Guardrail #4. `null` is fail-closed in BOTH directions (grant-free to the claims trust
    // gate, power-conferring to the provisioning guard) and neither throws: the trust gate
    // just mints nothing and the member is published on the Directiva with no roles. Every
    // shape here is an anomaly no legitimate flow produces — a routine grant-free cargo
    // returns [], not null — so an operator gets one line per occurrence or nothing at all.
    const spy = vi.mocked(console.error);
    const db = fakeDb({ "positions/str": { grants: "Admin" } });
    await readPositionGrants(db, "a/b");
    await readPositionGrants(db, 42);
    await readPositionGrants(db, "ghost");
    await readPositionGrants(db, "str");
    expect(spy.mock.calls.map(([message]) => message)).toEqual([
      expect.stringMatching(/not a usable doc id/),
      expect.stringMatching(/not a usable doc id/),
      expect.stringMatching(/missing/),
      expect.stringMatching(/not an array/),
    ]);
    // Ids, never the doc — and bounded, because Cloud Logging drops an over-large entry
    // whole and isSafeDocId tolerates 1500 bytes.
    await readPositionGrants(db, "x".repeat(1501));
    const [, meta] = spy.mock.calls[4];
    expect(String((meta as { cargoId: string }).cargoId).length).toBeLessThanOrEqual(65);
  });

  it("stays quiet on the paths that resolve", async () => {
    // The paired negative: a well-formed cargo — grant-bearing or grant-free — is the routine
    // case on every member write, and logging it would drown the anomalies above.
    const db = fakeDb({ "positions/p1": { grants: ["Admin"] }, "positions/p2": {} });
    await readPositionGrants(db, "p1");
    await readPositionGrants(db, "p2");
    expect(console.error).not.toHaveBeenCalled();
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
