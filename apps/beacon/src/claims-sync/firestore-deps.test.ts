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
 *
 *  `doc()` reproduces the SYNCHRONOUS half of the real admin SDK's rejections — the
 *  path-segment check, which is what makes the empty and "/"-bearing cases provable here
 *  rather than merely asserted. It does NOT model `.`, `..` or `__name__`: those build a
 *  reference fine and fail later at `get()` with a server INVALID_ARGUMENT. An earlier
 *  version of this comment claimed parity with "the same paths the real admin SDK rejects",
 *  which overstated it. The screening covers all of them regardless (isSafeDocId is what
 *  the test asserts), so the fake's narrower throw does not weaken the test — it only means
 *  the reserved-id rows prove the filter, not the throw. */
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

/** An Auth stub narrow enough to drive `auth.getUser(uid)` — the only Auth surface the claims
 *  accessors reach. The cast is test-only and justified: UserRecord carries a dozen fields
 *  (metadata, providerData, toJSON) that nothing under test reads, and fabricating them would
 *  assert nothing. A missing uid throws the real `auth/user-not-found` code, because that is
 *  the ONE error getUserOrNull swallows. */
function fakeAuth(users: Record<string, { customClaims?: unknown }>): Auth {
  return {
    getUser: async (uid: string) => {
      const user = users[uid];
      if (!user) throw Object.assign(new Error("user not found"), { code: "auth/user-not-found" });
      return user;
    },
  } as unknown as Auth;
}

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
    expect(docs).toEqual([{ permissions: ["read:Member"], builtInKey: "Treasury", live: true }]);
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

  it("BLOCKING: logs BOTH the duplicate-key AND the off-id line when both hold", async () => {
    // These used to be `else if`, so a key with two docs where one is ALSO off-id logged only
    // the duplicate line — hiding the frozen-perms condition, the one the spec calls a
    // permanent silent freeze the reseed still reports as ok:true. Both conditions are real
    // here and both must be reported.
    const errors = captureErrors();
    const { db } = fakeDb([builtIn("Treasury", "Treasury"), builtIn("Tesoreria", "Treasury")]);
    const docs = await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(docs).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.[1]).toMatchObject({
      builtInKey: "Treasury",
      ids: ["Treasury", "Tesoreria"],
    });
    // The off-id doc is Tesoreria; roles/Treasury DOES exist here, so the reseed updates that
    // one independently and never reports a failure — Tesoreria just freezes silently.
    expect(errors[1]?.[1]).toMatchObject({
      builtInKey: "Treasury",
      id: "Tesoreria",
      reseedSignal: expect.stringContaining("never read"),
    });
    expect(errors[1]?.[1]).toMatchObject({
      reseedSignal: expect.stringContaining("roles/Treasury exists and is reseeded"),
    });
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

/** The wire that carries the assigner's claims into resolveTrustedGrants' power-grant trust
 *  gate. sync.test.ts drives that gate through an in-memory fake, so this is the only place the
 *  real accessor's filtering is exercised — and a `perms` array that arrived unfiltered would
 *  hand the gate a junk code to match on. */
describe("getAssignerClaims", () => {
  it("BLOCKING: round-trips roles and perms, dropping entries outside the vocabulary", async () => {
    const { db } = fakeDb([]);
    const deps = firestoreClaimsDeps(
      db,
      fakeAuth({
        "delegate-uid": {
          customClaims: {
            roles: ["Member", "NotARole", 42],
            perms: ["update:BoardSeat", "nope:Thing", null],
          },
        },
      }),
    );
    await expect(deps.getAssignerClaims("delegate-uid")).resolves.toEqual({
      roles: ["Member"],
      perms: ["update:BoardSeat"],
    });
  });

  it("fails closed to empty claims for an absent, claimless or malformed-claim assigner", async () => {
    // Unlike getExistingClaims, `perms` is never undefined here: the gate does an `.includes()`
    // on it, so absence must arrive as an empty array and DENY rather than throw.
    const { db } = fakeDb([]);
    const deps = firestoreClaimsDeps(
      db,
      fakeAuth({
        claimless: {},
        malformed: { customClaims: { roles: "Admin", perms: "update:BoardSeat" } },
      }),
    );
    const empty = { roles: [], perms: [] };
    await expect(deps.getAssignerClaims("ghost")).resolves.toEqual(empty);
    await expect(deps.getAssignerClaims("claimless")).resolves.toEqual(empty);
    await expect(deps.getAssignerClaims("malformed")).resolves.toEqual(empty);
  });
});

describe("getRolesByIds id screening", () => {
  const custom = (id: string, extra: Record<string, unknown> = {}): RoleFixture => ({
    id,
    data: { permissions: ["manage:Ally"], active: true, ...extra },
  });

  it("BLOCKING: an unusable roleId is screened out instead of throwing forever", async () => {
    // db.doc() throws on these, and that throw fails this member's claims sync
    // PERMANENTLY — every later write re-throws until someone edits members.roleIds.
    const errors = captureErrors();
    const { db, getAllPaths } = fakeDb([custom("role-x")]);
    const out = await firestoreClaimsDeps(db, auth).getRolesByIds([
      "role-x",
      "",
      "roles/evil",
      "..",
      "__name__",
    ]);
    expect(out).toEqual([{ permissions: ["manage:Ally"] }]);
    expect(getAllPaths).toEqual([["roles/role-x"]]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[1]).toMatchObject({
      rejectedCount: 4,
      totalCount: 5,
      rejectedSample: ["", "roles/evil", "..", "__name__"],
    });
  });

  it("BLOCKING: bounds the log — a count plus a capped sample, never every rejected id", async () => {
    // roleIds is Admin-writable with no size or length cap in rules. Serializing all of them
    // let one junk-filled member doc push the entry past Cloud Logging's 256 KB per-entry
    // limit, which DROPS the entry — the anomaly went invisible at the scale that matters.
    const errors = captureErrors();
    const { db } = fakeDb([]);
    const junk = Array.from({ length: 10_000 }, (_, i) => `bad/${i}`);
    const longId = `x/${"y".repeat(5_000)}`;
    expect(await firestoreClaimsDeps(db, auth).getRolesByIds([...junk, longId])).toEqual([]);
    const meta = errors[0]?.[1] as {
      rejectedCount: number;
      rejectedSample: string[];
    };
    expect(meta.rejectedCount).toBe(10_001);
    expect(meta.rejectedSample).toHaveLength(10);
    // Every sampled entry is length-capped too, so one enormous id cannot blow the budget
    // through the sample either.
    for (const entry of meta.rejectedSample) expect(entry.length).toBeLessThanOrEqual(65);
    expect(JSON.stringify(meta).length).toBeLessThan(2_000);
  });

  it("issues no getAll at all when every roleId is unusable", async () => {
    captureErrors();
    const { db, getAllPaths } = fakeDb([custom("role-x")]);
    expect(await firestoreClaimsDeps(db, auth).getRolesByIds(["", "a/b"])).toEqual([]);
    expect(getAllPaths).toEqual([]);
  });

  it("logs nothing and reads the doc for a well-formed id", async () => {
    const errors = captureErrors();
    const { db, getAllPaths } = fakeDb([custom("role-x")]);
    expect(await firestoreClaimsDeps(db, auth).getRolesByIds(["role-x"])).toEqual([
      { permissions: ["manage:Ally"] },
    ]);
    expect(getAllPaths).toEqual([["roles/role-x"]]);
    expect(errors).toEqual([]);
  });

  it("keeps dropping inactive and missing docs", async () => {
    captureErrors();
    const { db } = fakeDb([custom("gone", { active: false }), custom("kept")]);
    expect(await firestoreClaimsDeps(db, auth).getRolesByIds(["gone", "kept", "absent"])).toEqual([
      { permissions: ["manage:Ally"] },
    ]);
  });
});

describe("getRoleDocsByBuiltInKeys memoization", () => {
  it("BLOCKING: a second call with the same keys issues no second query", async () => {
    // onRoleWritten's fan-out calls this once per member; the repeat query is what makes the
    // scan time out. NOTE the memo is NOT justified by the doc set being immutable within an
    // invocation (an earlier comment claimed that; it is false — see the staleness block
    // below). It is justified by the timeout, with the staleness made observable instead.
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

  it("BLOCKING: freezes the memoized graph, so no member of the fan-out can corrupt it", async () => {
    // The SAME array, the SAME doc objects and the SAME permissions arrays are handed to
    // every member of the fan-out. A future in-place `doc.permissions.sort()` would be one
    // write with N wrong results and no log; frozen, it throws instead.
    // TWO perms, in an order sort() must actually swap: sorting a 1-element array performs no
    // write and therefore does NOT throw on a frozen array, which would make this vacuous.
    const { db } = fakeDb([
      builtIn("Treasury", "Treasury", { permissions: ["read:Position", "read:Member"] }),
    ]);
    const docs = await firestoreClaimsDeps(db, auth).getRoleDocsByBuiltInKeys(["Treasury"]);

    expect(Object.isFrozen(docs)).toBe(true);
    expect(Object.isFrozen(docs[0])).toBe(true);
    expect(Object.isFrozen(docs[0]?.permissions)).toBe(true);
    expect(() => docs.push(...docs)).toThrow();
    expect(() => docs[0]?.permissions.sort()).toThrow();
    expect(docs[0]?.permissions).toEqual(["read:Position", "read:Member"]);
  });
});

/** The memo's one unsafe assumption, and the probe that makes it observable.
 *
 *  onRoleWritten and recomputeAllClaims each hold ONE deps instance for up to 540 s, so a
 *  role doc CAN be written under a running fan-out. The memo then serves every remaining
 *  member a pre-change snapshot, and with retry:false nothing ever corrects them. These
 *  tests pin both halves: that the staleness is real (so the probe is not decoration), and
 *  that the probe reports exactly the affected keys. */
describe("staleBuiltInRoleKeys", () => {
  it("BLOCKING: reports the key whose doc changed under a warmed memo", async () => {
    const fixtures = [builtIn("Membership", "Membership"), builtIn("Treasury", "Treasury")];
    const { db, builtInQueries } = fakeDb(fixtures);
    const deps = firestoreClaimsDeps(db, auth);

    const served = await deps.getRoleDocsByBuiltInKeys(["Membership", "Treasury"]);
    expect(served.find((d) => d.builtInKey === "Membership")?.live).toBe(true);

    // Admin deactivates roles/Membership 60 s into the fan-out.
    const membership = fixtures.find((f) => f.id === "Membership");
    if (membership) membership.data = { ...membership.data, active: false };

    // The memo is genuinely stale — this is the bug, stated as an assertion. A later member
    // of the SAME fan-out is still told Membership is live, and so keeps its perms.
    const late = await deps.getRoleDocsByBuiltInKeys(["Membership", "Treasury"]);
    expect(late.find((d) => d.builtInKey === "Membership")?.live).toBe(true);

    // Membership ONLY — Treasury shared a cache entry with it but did not itself move.
    expect(await deps.staleBuiltInRoleKeys()).toEqual(["Membership"]);
    // The fan-out's reads (1) plus exactly ONE probe read.
    expect(builtInQueries).toHaveLength(2);
  });

  it("reports nothing when the role docs did not change", async () => {
    const { db } = fakeDb([builtIn("Treasury", "Treasury")]);
    const deps = firestoreClaimsDeps(db, auth);
    await deps.getRoleDocsByBuiltInKeys(["Treasury", "Member"]);
    expect(await deps.staleBuiltInRoleKeys()).toEqual([]);
  });

  it("detects a doc APPEARING under the fan-out, not just changing", async () => {
    // The pre-seed direction: an uncovered key mints BUILT_IN_ROLE_PERMS through the
    // fallback, so a doc arriving mid-fan-out changes what later members should have got.
    const fixtures: RoleFixture[] = [];
    const { db } = fakeDb(fixtures);
    const deps = firestoreClaimsDeps(db, auth);
    expect(await deps.getRoleDocsByBuiltInKeys(["Treasury"])).toEqual([]);
    fixtures.push(builtIn("Treasury", "Treasury"));
    expect(await deps.staleBuiltInRoleKeys()).toEqual(["Treasury"]);
  });

  it("issues no query at all when the memo was never warmed", async () => {
    const { db, builtInQueries } = fakeDb([builtIn("Treasury", "Treasury")]);
    expect(await firestoreClaimsDeps(db, auth).staleBuiltInRoleKeys()).toEqual([]);
    expect(builtInQueries).toEqual([]);
  });

  it("covers every memoized key SET with a single union query", async () => {
    const fixtures = [builtIn("Treasury", "Treasury"), builtIn("Membership", "Membership")];
    const { db, builtInQueries } = fakeDb(fixtures);
    const deps = firestoreClaimsDeps(db, auth);
    await deps.getRoleDocsByBuiltInKeys(["Treasury"]);
    await deps.getRoleDocsByBuiltInKeys(["Membership"]);
    await deps.getRoleDocsByBuiltInKeys(["Treasury", "Membership"]);
    const before = builtInQueries.length;

    const treasury = fixtures.find((f) => f.id === "Treasury");
    if (treasury) treasury.data = { ...treasury.data, active: false };

    // Three cached sets, ONE probe query over their union, and only the key that moved.
    expect(await deps.staleBuiltInRoleKeys()).toEqual(["Treasury"]);
    expect(builtInQueries).toHaveLength(before + 1);
  });

  it("reports only the diverging set when another memoized set is unaffected", async () => {
    const fixtures = [builtIn("Treasury", "Treasury"), builtIn("Membership", "Membership")];
    const { db } = fakeDb(fixtures);
    const deps = firestoreClaimsDeps(db, auth);
    await deps.getRoleDocsByBuiltInKeys(["Treasury"]);
    await deps.getRoleDocsByBuiltInKeys(["Membership"]);

    const treasury = fixtures.find((f) => f.id === "Treasury");
    if (treasury) treasury.data = { ...treasury.data, permissions: ["manage:Ally"] };

    expect(await deps.staleBuiltInRoleKeys()).toEqual(["Treasury"]);
  });

  it("does not re-log the coverage anomalies it re-reads", async () => {
    // The probe re-runs the same query purely to compare. Re-logging every anomaly there
    // would double each line and imply the condition had occurred twice.
    const { db } = fakeDb([builtIn("Tesoreria", "Treasury")]);
    const deps = firestoreClaimsDeps(db, auth);
    const errors = captureErrors();
    await deps.getRoleDocsByBuiltInKeys(["Treasury"]);
    expect(errors).toHaveLength(1);
    await deps.staleBuiltInRoleKeys();
    expect(errors).toHaveLength(1);
  });
});
