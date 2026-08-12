import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { firestoreClaimsDeps } from "./firestore-deps.js";

type RoleFixture = { id: string; data: Record<string, unknown> };

function roleSnap(fixture: RoleFixture) {
  return {
    id: fixture.id,
    exists: true,
    data: () => fixture.data,
    get: (field: string) => fixture.data[field],
  };
}

/** A stand-in for the only three Firestore surfaces these deps reach:
 *  `collection("roles").where(...).get()`, `doc()` and `getAll()`. Cast rather than
 *  fabricated with mock methods, so the shape stays honest about what is exercised.
 *  `doc()` throws on the same paths the real admin SDK rejects — that is what makes the
 *  id screening in getRolesByIds provable instead of asserted. */
function fakeDb(fixtures: RoleFixture[]) {
  const builtInQueries: string[][] = [];
  const getAllPaths: string[][] = [];
  const db = {
    collection: (name: string) => {
      expect(name).toBe("roles");
      return {
        where: (field: string, op: string, keys: string[]) => ({
          get: async () => {
            expect([field, op]).toEqual(["builtInKey", "in"]);
            builtInQueries.push(keys);
            return {
              docs: fixtures
                .filter((f) => keys.includes(f.data.builtInKey as string))
                .map((f) => roleSnap(f)),
            };
          },
        }),
      };
    },
    doc: (path: string) => {
      const segments = path.split("/");
      if (segments.length !== 2 || segments.some((s) => s.length === 0)) {
        throw new Error(`Value for argument "documentPath" must point to a document: ${path}`);
      }
      return { path };
    },
    getAll: async (...refs: { path: string }[]) => {
      getAllPaths.push(refs.map((r) => r.path));
      return refs.map((ref) => {
        const id = ref.path.slice("roles/".length);
        const found = fixtures.find((f) => f.id === id);
        return found
          ? roleSnap(found)
          : { id, exists: false, data: () => undefined, get: () => undefined };
      });
    },
  } as unknown as Firestore;
  return { db, builtInQueries, getAllPaths };
}

/** Cast, not a fabricated Auth: every dep exercised here is a pure Firestore read. */
const auth = {} as Auth;

const builtIn = (id: string, key: string, extra: Record<string, unknown> = {}): RoleFixture => ({
  id,
  data: { builtIn: true, builtInKey: key, permissions: ["read:Member"], active: true, ...extra },
});

function captureErrors() {
  const calls: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    calls.push(args);
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getRoleDocsByBuiltInKeys coverage anomalies", () => {
  it("logs nothing for a well-formed built-in doc", async () => {
    const errors = captureErrors();
    const { db } = fakeDb([builtIn("Treasury", "Treasury")]);
    const docs = await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(docs).toEqual([
      { permissions: ["read:Member"], builtInKey: "Treasury", active: true },
    ]);
    expect(errors).toEqual([]);
  });

  it("BLOCKING: logs the dropped ids when a matched doc is not builtIn:true", async () => {
    // The dropped doc leaves its key UNCOVERED, so resolveMemberPerms re-mints
    // BUILT_IN_ROLE_PERMS[key] — a deactivation becomes a silent no-op.
    const errors = captureErrors();
    const { db } = fakeDb([
      { id: "Treasury", data: { builtInKey: "Treasury", permissions: [], active: false } },
    ]);
    const docs = await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(docs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[1]).toMatchObject({ droppedIds: ["Treasury"] });
  });

  it("logs when two docs claim one builtInKey", async () => {
    const errors = captureErrors();
    const { db } = fakeDb([builtIn("Treasury", "Treasury"), builtIn("Tesoreria", "Treasury")]);
    const docs = await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(docs).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[1]).toMatchObject({ builtInKey: "Treasury", ids: ["Treasury", "Tesoreria"] });
  });

  it("logs a doc that covers a builtInKey from a different doc id", async () => {
    // Not dropped (the query matches on the field) but the reseed reads it as
    // not-built-in and never updates it, so its perms freeze while /permisos shows Treasury.
    const errors = captureErrors();
    const { db } = fakeDb([builtIn("Tesoreria", "Treasury")]);
    const docs = await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(docs).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[1]).toMatchObject({ builtInKey: "Treasury", id: "Tesoreria" });
  });

  it("returns [] without querying when there are no keys", async () => {
    const { db, builtInQueries } = fakeDb([builtIn("Treasury", "Treasury")]);
    expect(await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys([])).toEqual([]);
    expect(builtInQueries).toEqual([]);
  });
});

describe("getRoleDocsByBuiltInKeys memoization", () => {
  it("BLOCKING: a second call with the same keys issues no second query", async () => {
    // onRoleWritten's fan-out calls this once per member for a ≤9-doc set that cannot
    // change within one invocation; the repeat query is what makes the scan time out.
    const { db, builtInQueries } = fakeDb([builtIn("Treasury", "Treasury")]);
    const deps = firestoreClaimsDeps(db, auth);
    const first = await deps.getRoleDocsByBuiltInKeys(["Treasury", "Member"]);
    const second = await deps.getRoleDocsByBuiltInKeys(["Treasury", "Member"]);
    expect(builtInQueries).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("keys the memo on the SET, so order and duplicates hit the same entry", async () => {
    const { db, builtInQueries } = fakeDb([builtIn("Treasury", "Treasury")]);
    const deps = firestoreClaimsDeps(db, auth);
    await deps.getRoleDocsByBuiltInKeys(["Treasury", "Member"]);
    await deps.getRoleDocsByBuiltInKeys(["Member", "Treasury", "Member"]);
    expect(builtInQueries).toHaveLength(1);
  });

  it("queries again for a different key set", async () => {
    const { db, builtInQueries } = fakeDb([builtIn("Treasury", "Treasury")]);
    const deps = firestoreClaimsDeps(db, auth);
    await deps.getRoleDocsByBuiltInKeys(["Treasury"]);
    await deps.getRoleDocsByBuiltInKeys(["Treasury", "Member"]);
    expect(builtInQueries).toHaveLength(2);
  });

  it("does not memoize a rejection (a transient error must not poison the fan-out)", async () => {
    let attempts = 0;
    const db = {
      collection: () => ({
        where: () => ({
          get: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error("DEADLINE_EXCEEDED");
            return { docs: [] };
          },
        }),
      }),
    } as unknown as Firestore;
    const deps = firestoreClaimsDeps(db, auth);
    await expect(deps.getRoleDocsByBuiltInKeys(["Treasury"])).rejects.toThrow("DEADLINE_EXCEEDED");
    await expect(deps.getRoleDocsByBuiltInKeys(["Treasury"])).resolves.toEqual([]);
    expect(attempts).toBe(2);
  });

  it("does not share the memo across deps instances (one per invocation)", async () => {
    const { db, builtInQueries } = fakeDb([builtIn("Treasury", "Treasury")]);
    await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(builtInQueries).toHaveLength(2);
  });
});
