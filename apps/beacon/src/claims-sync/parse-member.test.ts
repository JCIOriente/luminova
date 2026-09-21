import { describe, expect, it } from "vitest";
import { parseMember, type MemberParseContext } from "./parse-member.js";

/** For tests exercising pure parse behavior with nothing to log to — `context` is required
 *  on `parseMember` precisely so a real call site can't get away with omitting one. */
const silent = (): MemberParseContext => ({ memberId: "m-test", logError: () => {} });

/** A capturing LogSink plus the context that feeds it. Not `vi.fn()`: these assertions are
 *  about the CONTENT of the meta object (ids, types, counts — and nothing else), which reads
 *  better against a plain array than through mock-call indexing. */
function recorder(): {
  lines: { message: string; meta: Record<string, unknown> }[];
  context: MemberParseContext;
} {
  const lines: { message: string; meta: Record<string, unknown> }[] = [];
  return {
    lines,
    context: {
      memberId: "member-1",
      logError: (message, meta) => {
        lines.push({ message, meta });
      },
    },
  };
}

describe("parseMember", () => {
  const NO_GRANTS = { grant: [], revoke: [] };

  it("passes through a well-formed member (incl. assignedBy)", () => {
    const result = parseMember(
      {
        uid: "u1",
        positions: {
          "2026": { cargoId: "pos-pres", comisionIds: ["com-a", "com-b"], assignedBy: "admin-uid" },
        },
      },
      silent(),
    );
    expect(result).toEqual({
      uid: "u1",
      positions: {
        "2026": { cargoId: "pos-pres", comisionIds: ["com-a", "com-b"], assignedBy: "admin-uid" },
      },
      roleIds: [],
      permissionOverrides: NO_GRANTS,
    });
  });

  it("extracts roleIds and filters override codes to the known vocabulary", () => {
    const result = parseMember(
      {
        uid: "u1",
        positions: {},
        roleIds: ["custom-1", "custom-2"],
        permissionOverrides: { grant: ["manage:Position", "bogus:Code"], revoke: ["read:Member"] },
      },
      silent(),
    );
    expect(result.roleIds).toEqual(["custom-1", "custom-2"]);
    expect(result.permissionOverrides).toEqual({
      grant: ["manage:Position"],
      revoke: ["read:Member"],
    });
  });

  it("defaults roleIds to [] and overrides to empty when absent or malformed", () => {
    expect(parseMember({ uid: "u1", positions: {}, roleIds: "nope" }, silent()).roleIds).toEqual(
      [],
    );
    expect(parseMember({ uid: "u1", positions: {} }, silent()).permissionOverrides).toEqual(
      NO_GRANTS,
    );
    expect(
      parseMember({ uid: "u1", positions: {}, permissionOverrides: { grant: "x" } }, silent())
        .permissionOverrides,
    ).toEqual(NO_GRANTS);
  });

  it("drops a term whose comisionIds is present but not a string array", () => {
    const result = parseMember(
      {
        uid: "u1",
        positions: {
          good: { cargoId: "p", comisionIds: ["c"] },
          bad: { cargoId: "p", comisionIds: "not-an-array" },
          alsoBad: { cargoId: "p", comisionIds: [1, 2] },
        },
      },
      silent(),
    );
    expect(result.positions).toEqual({ good: { cargoId: "p", comisionIds: ["c"] } });
  });

  it("defaults an absent comisionIds to [] when cargoId is valid", () => {
    const result = parseMember(
      {
        uid: "u1",
        positions: {
          "2026": { cargoId: "pos-pres", assignedBy: "admin-uid" },
          nullCargo: { cargoId: null },
        },
      },
      silent(),
    );
    expect(result.positions["2026"]).toEqual({
      cargoId: "pos-pres",
      comisionIds: [],
      assignedBy: "admin-uid",
    });
    expect(result.positions.nullCargo).toEqual({ cargoId: null, comisionIds: [] });
  });

  it("yields empty positions when positions is an array", () => {
    expect(parseMember({ uid: "u1", positions: [] }, silent()).positions).toEqual({});
    expect(parseMember({ uid: "u1", positions: ["x"] }, silent()).positions).toEqual({});
  });

  it("yields empty positions when positions is a string", () => {
    expect(parseMember({ uid: "u1", positions: "nope" }, silent()).positions).toEqual({});
  });

  it("returns undefined uid when missing or non-string", () => {
    expect(parseMember({ positions: {} }, silent()).uid).toBeUndefined();
    expect(parseMember({ uid: 42, positions: {} }, silent()).uid).toBeUndefined();
  });

  it("preserves a null cargoId", () => {
    const result = parseMember(
      {
        uid: "u1",
        positions: { "2026": { cargoId: null, comisionIds: [] } },
      },
      silent(),
    );
    expect(result.positions["2026"]).toEqual({ cargoId: null, comisionIds: [] });
  });

  it("drops a term whose cargoId is missing or non-string/non-null", () => {
    const result = parseMember(
      {
        uid: "u1",
        positions: {
          missing: { comisionIds: [] },
          numeric: { cargoId: 7, comisionIds: [] },
        },
      },
      silent(),
    );
    expect(result.positions).toEqual({});
  });

  it("handles null/undefined raw input", () => {
    const empty = { uid: undefined, positions: {}, roleIds: [], permissionOverrides: NO_GRANTS };
    expect(parseMember(null, silent())).toEqual(empty);
    expect(parseMember(undefined, silent())).toEqual(empty);
  });

  it("logs a present-but-non-string uid — the member is skipped by both fan-outs", () => {
    const { lines, context } = recorder();
    expect(parseMember({ uid: 42, positions: {} }, context).uid).toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toContain("uid is present but not a string");
    expect(lines[0]?.meta).toEqual({ memberId: "member-1", uidType: "number" });
  });

  it("logs a positions that is not a map, naming the shape", () => {
    const cases: { positions: unknown; positionsType: string }[] = [
      { positions: [], positionsType: "array" },
      { positions: ["x"], positionsType: "array" },
      { positions: "nope", positionsType: "string" },
      // Falsy non-objects used to take the same silent branch as an ABSENT positions.
      { positions: false, positionsType: "boolean" },
    ];
    for (const { positions, positionsType } of cases) {
      const { lines, context } = recorder();
      expect(parseMember({ uid: "u1", positions }, context).positions).toEqual({});
      expect(lines).toHaveLength(1);
      expect(lines[0]?.message).toContain("positions is not a map");
      expect(lines[0]?.meta).toEqual({ memberId: "member-1", positionsType });
    }
  });

  it("logs every dropped term entry in ONE bounded line, naming the term and the shape", () => {
    const { lines, context } = recorder();
    // The reachable case this log exists for: `comisionIds` is a string, so the WHOLE 2026
    // entry goes — cargoId and assignedBy with it — and the sitting president reads as
    // holding no seat everywhere downstream. firestore.rules type-checks none of this.
    const result = parseMember(
      {
        uid: "pres",
        positions: {
          "2022": ["x"],
          "2023": "nope",
          "2024": { comisionIds: [] },
          "2025": { cargoId: 7, comisionIds: [] },
          "2026": { cargoId: "pos-presidente", assignedBy: "admin-uid", comisionIds: "COM-1" },
          kept: { cargoId: null, comisionIds: [] },
        },
      },
      context,
    );
    expect(result.positions).toEqual({ kept: { cargoId: null, comisionIds: [] } });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toContain("position entries are malformed");
    // Integer-like keys iterate numerically first, then insertion order — hence 2022…2026, kept.
    expect(lines[0]?.meta).toEqual({
      memberId: "member-1",
      droppedCount: 5,
      dropped: [
        { term: "2022", reason: "term-entry-not-a-map:array" },
        { term: "2023", reason: "term-entry-not-a-map:string" },
        { term: "2024", reason: "cargo-id-not-a-string:undefined" },
        { term: "2025", reason: "cargo-id-not-a-string:number" },
        { term: "2026", reason: "comision-ids-not-a-string-array:string" },
      ],
    });

    // BOUNDED, in the same line: the count stays exact while the sample caps, because a
    // console or migration write can author arbitrarily many term keys and an over-large
    // Cloud Logging entry is dropped whole.
    const many = recorder();
    const term = (i: number) => `t${i}-${"x".repeat(80)}`;
    const positions = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [term(i), { cargoId: 7 }]),
    );
    expect(parseMember({ uid: "u1", positions }, many.context).positions).toEqual({});
    expect(many.lines).toHaveLength(1);
    expect(many.lines[0]?.meta).toEqual({
      memberId: "member-1",
      droppedCount: 25,
      // Ten rows, and every named term truncated to the shared 64-char log cap.
      dropped: Array.from({ length: 10 }, (_, i) => ({
        term: `${term(i).slice(0, 64)}…`,
        reason: "cargo-id-not-a-string:number",
      })),
    });
  });

  it("logs a roleIds that is not an array of strings — valid entries go with it", () => {
    const { lines, context } = recorder();
    expect(
      parseMember({ uid: "u1", positions: {}, roleIds: ["ok", 7, null] }, context).roleIds,
    ).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toContain("roleIds is not an array of strings");
    expect(lines[0]?.meta).toEqual({
      memberId: "member-1",
      roleIdsType: "array",
      entryCount: 3,
      nonStringCount: 2,
    });

    const scalar = recorder();
    parseMember({ uid: "u1", positions: {}, roleIds: "nope" }, scalar.context);
    expect(scalar.lines[0]?.meta).toEqual({
      memberId: "member-1",
      roleIdsType: "string",
      entryCount: null,
      nonStringCount: null,
    });
  });

  it("logs dropped permissionOverrides — the map shape, a non-array arm, unknown codes", () => {
    const notAMap = recorder();
    parseMember({ uid: "u1", positions: {}, permissionOverrides: ["manage:all"] }, notAMap.context);
    expect(notAMap.lines).toHaveLength(1);
    expect(notAMap.lines[0]?.message).toContain("permissionOverrides entries are malformed");
    expect(notAMap.lines[0]?.meta).toEqual({
      memberId: "member-1",
      problems: [{ field: "permissionOverrides", reason: "not-a-map", valueType: "array" }],
    });

    const arms = recorder();
    const result = parseMember(
      {
        uid: "u1",
        positions: {},
        permissionOverrides: { grant: "update:BoardSeat", revoke: ["read:Member", "bogus:Code"] },
      },
      arms.context,
    );
    expect(result.permissionOverrides).toEqual({ grant: [], revoke: ["read:Member"] });
    expect(arms.lines).toHaveLength(1);
    // Counts, never the rejected code itself: an unknown code is by definition unbounded free
    // text off a console edit.
    expect(arms.lines[0]?.meta).toEqual({
      memberId: "member-1",
      problems: [
        { field: "grant", reason: "not-an-array", valueType: "string" },
        { field: "revoke", reason: "unknown-code", count: 1 },
      ],
    });
  });

  it("stays SILENT on every ordinary member shape", () => {
    // The paired negative for all five screens above. These are the shapes of nearly every
    // member write — an unprovisioned member, a rank-and-file member with no seat, the
    // explicit nulls the rules' unchanged()/touched() gap admits. Logging any of them would
    // fire constantly and bury the anomalies, which is the whole reason the screens in
    // sync.ts guard on `rejectedCargoId !== null`.
    const ordinary: unknown[] = [
      null,
      undefined,
      {},
      { uid: "u1" },
      { uid: null, positions: {} },
      { uid: "u1", positions: null },
      { positions: { "2026": { cargoId: null, comisionIds: [] } } },
      { uid: "u1", positions: { "2026": { cargoId: "pos-pres" } } },
      { uid: "u1", positions: { "2026": { cargoId: "p", comisionIds: ["c"], assignedBy: "a" } } },
      { uid: "u1", roleIds: null },
      { uid: "u1", roleIds: [] },
      { uid: "u1", roleIds: ["custom-1"] },
      { uid: "u1", permissionOverrides: null },
      { uid: "u1", permissionOverrides: {} },
      { uid: "u1", permissionOverrides: { grant: null, revoke: undefined } },
      { uid: "u1", permissionOverrides: { grant: ["manage:Position"], revoke: ["read:Member"] } },
    ];
    for (const shape of ordinary) {
      const { lines, context } = recorder();
      parseMember(shape, context);
      expect(lines).toEqual([]);
    }
  });
});
