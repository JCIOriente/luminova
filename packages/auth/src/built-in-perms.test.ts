import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode } from "@luminova/types";
import { resolveBuiltInPerms, type BuiltInRoleDoc } from "./built-in-perms.js";

const NO_OVERRIDES = { grant: [], revoke: [] } as const;

/** Same shape beacon's `firestore-deps` hands in: array, docs and each `permissions`
 *  array all frozen, because one memoized graph is reused for the whole fan-out. */
function frozenDocs(docs: BuiltInRoleDoc[]): readonly BuiltInRoleDoc[] {
  return Object.freeze(
    docs.map((doc) => Object.freeze({ ...doc, permissions: Object.freeze(doc.permissions) })),
  );
}

describe("resolveBuiltInPerms", () => {
  it("falls back to the seed snapshot when NO doc claims the key", () => {
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [],
      customDocs: [],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Treasury].sort());
  });

  it("prefers a live doc's stored permissions over the seed snapshot", () => {
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [{ permissions: ["read:Member"], builtInKey: "Treasury", live: true }],
      customDocs: [],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual(["read:Member"]);
  });

  it("BLOCKING: a not-live doc contributes nothing AND suppresses the seed fallback", () => {
    // The distinction the whole three-way exists for: "deactivated" must not be
    // indistinguishable from "never seeded". Perms deliberately non-empty, so an
    // implementation that ignores `live` fails loudly instead of returning [] by accident.
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [{ permissions: ["manage:all"], builtInKey: "Treasury", live: false }],
      customDocs: [],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual([]);
  });

  it("BLOCKING: a not-live doc covers its key while an absent key still falls back", () => {
    // This does NOT construct a ghost — resolveBuiltInPerms never sees active/deletedAt;
    // it takes the caller's precomputed `live`. The ghost shape (`active: true` with a
    // non-null `deletedAt`) being derived INTO live: false is beacon's job, and the test
    // that feeds real doc fields through that derivation lives in
    // apps/beacon/src/claims-sync/sync.test.ts. What this case adds over the
    // suppresses-the-fallback test above is the split verdict: the covered key mints
    // nothing while the absent key still falls back to its seed — so the assertion cannot
    // pass by returning [] wholesale.
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury", "Secretary"],
      builtInDocs: [{ permissions: ["manage:all"], builtInKey: "Treasury", live: false }],
      customDocs: [],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Secretary].sort());
    expect(out).not.toContain("manage:all");
  });

  it.each([
    ["live doc first", false],
    ["not-live doc first", true],
  ])("unions the LIVE docs when two docs claim one key (%s)", (_name, deadFirst) => {
    const live: BuiltInRoleDoc = {
      permissions: ["read:Member"],
      builtInKey: "Treasury",
      live: true,
    };
    const alsoLive: BuiltInRoleDoc = {
      permissions: ["read:Position"],
      builtInKey: "Treasury",
      live: true,
    };
    const dead: BuiltInRoleDoc = {
      permissions: ["manage:all"],
      builtInKey: "Treasury",
      live: false,
    };
    const docs = deadFirst ? [dead, live, alsoLive] : [live, alsoLive, dead];
    expect(
      resolveBuiltInPerms({
        builtInRoleNames: ["Treasury"],
        builtInDocs: docs,
        customDocs: [],
        overrides: NO_OVERRIDES,
      }),
    ).toEqual(["read:Member", "read:Position"]);
  });

  it("BLOCKING: two docs claiming one key, both not live, still suppress the fallback", () => {
    // A per-key `find`/Map that kept only one doc would get this right by luck; a
    // `some(live)` coverage test would get it wrong and re-mint the snapshot.
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [
        { permissions: ["manage:all"], builtInKey: "Treasury", live: false },
        { permissions: ["read:Member"], builtInKey: "Treasury", live: false },
      ],
      customDocs: [],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual([]);
  });

  it("BLOCKING: a doc for an unrequested key is IGNORED — no perms, no coverage", () => {
    // Settles the one divergence between the two former implementations, in the tighter
    // direction: beacon unioned every doc it was handed without checking the key. No
    // production path produces such a doc (the query is where('builtInKey','in',keys)),
    // so this direct test is the only thing pinning the choice.
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [
        { permissions: ["manage:all"], builtInKey: "Membership", live: true },
        { permissions: ["manage:Ally"], builtInKey: "Secretary", live: false },
      ],
      customDocs: [],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Treasury].sort());
  });

  it("unions custom role docs with the built-in resolution", () => {
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [{ permissions: ["read:Member"], builtInKey: "Treasury", live: true }],
      customDocs: [{ permissions: ["manage:Ally"] }],
      overrides: NO_OVERRIDES,
    });
    expect(out).toEqual(["manage:Ally", "read:Member"]);
  });

  it("applies overrides on top: grant adds, revoke wins", () => {
    const out = resolveBuiltInPerms({
      builtInRoleNames: ["Treasury"],
      builtInDocs: [],
      customDocs: [],
      overrides: { grant: ["manage:Position", "read:Member"], revoke: ["read:Member"] },
    });
    expect(out).toEqual(["manage:Position", "read:MemberPoints"]);
  });

  it("resolves with no overrides argument at all", () => {
    expect(
      resolveBuiltInPerms({
        builtInRoleNames: [],
        builtInDocs: [],
        customDocs: [{ permissions: ["manage:Ally"] }],
      }),
    ).toEqual(["manage:Ally"]);
  });

  it("BLOCKING: does not mutate a deep-frozen input graph", () => {
    // Beacon memoizes ONE frozen graph and hands it to every member of an unbounded
    // fan-out. An in-place `.sort()` here would corrupt every remaining member's claims —
    // frozen, it throws in strict mode instead, which is what this test observes.
    const names = Object.freeze<["Membership", "Treasury", "Secretary"]>([
      "Membership",
      "Treasury",
      "Secretary",
    ]);
    const docs = frozenDocs([
      {
        permissions: ["read:Position", "checkIn:Attendance"],
        builtInKey: "Membership",
        live: true,
      },
      { permissions: ["manage:all"], builtInKey: "Treasury", live: false },
    ]);
    const customPerms: PermissionCode[] = ["manage:Ally"];
    Object.freeze(customPerms);
    const customDocs = Object.freeze([Object.freeze({ permissions: customPerms })]);

    const out = resolveBuiltInPerms({
      builtInRoleNames: names,
      builtInDocs: docs,
      customDocs,
      overrides: NO_OVERRIDES,
    });

    expect(out).toEqual(
      [
        ...new Set([
          "read:Position",
          "checkIn:Attendance",
          "manage:Ally",
          ...BUILT_IN_ROLE_PERMS.Secretary,
        ]),
      ].sort(),
    );
    expect(names).toEqual(["Membership", "Treasury", "Secretary"]);
    expect(docs[0]?.permissions).toEqual(["read:Position", "checkIn:Attendance"]);
    expect(docs[1]?.permissions).toEqual(["manage:all"]);
    expect(customDocs[0]?.permissions).toEqual(["manage:Ally"]);
  });
});
