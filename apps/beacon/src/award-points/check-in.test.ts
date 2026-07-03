import { describe, it, expect } from "vitest";
import { participationId } from "./participation-id.js";
import { checkInActivityIds, checkInIdentityChanged, validateCheckIn } from "./check-in.js";

const ts = { toMillis: () => 1_000 } as unknown as import("firebase-admin/firestore").Timestamp;

describe("participationId", () => {
  it("is deterministic per (activity, member, role)", () => {
    expect(participationId("a1", "m1", "Attendee")).toBe("a1__m1__Attendee");
  });
});

describe("validateCheckIn", () => {
  it("accepts a well-formed check-in", () => {
    expect(
      validateCheckIn({ memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: ts }),
    ).toEqual({
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
      checkInAt: ts,
    });
  });

  it("rejects an unknown role", () => {
    expect(
      validateCheckIn({ memberId: "m1", activityId: "a1", role: "Boss", checkInAt: ts }),
    ).toBeNull();
  });

  it("rejects missing ids or timestamp", () => {
    expect(
      validateCheckIn({ memberId: "", activityId: "a1", role: "Attendee", checkInAt: ts }),
    ).toBeNull();
    expect(
      validateCheckIn({ memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: null }),
    ).toBeNull();
    expect(validateCheckIn(undefined)).toBeNull();
  });

  it("rejects ids containing '/' or '__' (path/collision safety)", () => {
    expect(
      validateCheckIn({ memberId: "m/1", activityId: "a1", role: "Attendee", checkInAt: ts }),
    ).toBeNull();
    expect(
      validateCheckIn({ memberId: "m__1", activityId: "a1", role: "Attendee", checkInAt: ts }),
    ).toBeNull();
    expect(
      validateCheckIn({ memberId: "m1", activityId: "a/1", role: "Attendee", checkInAt: ts }),
    ).toBeNull();
  });
});

describe("checkInIdentityChanged", () => {
  const base = { memberId: "m1", activityId: "a1", role: "Attendee", checkInAt: ts } as const;
  it("flags a change in any identity field", () => {
    expect(checkInIdentityChanged(base, { ...base, memberId: "m2" })).toBe(true);
    expect(checkInIdentityChanged(base, { ...base, activityId: "a2" })).toBe(true);
    expect(checkInIdentityChanged(base, { ...base, role: "Team" })).toBe(true);
  });
  it("ignores non-identity changes (checkInAt)", () => {
    const laterTs = { toMillis: () => 2_000 } as unknown as typeof ts;
    expect(checkInIdentityChanged(base, { ...base, checkInAt: laterTs })).toBe(false);
  });
});

describe("checkInActivityIds", () => {
  it("collects both sides of an identity move, deduped", () => {
    expect(checkInActivityIds({ activityId: "a1" }, { activityId: "a2" })).toEqual(["a1", "a2"]);
    expect(checkInActivityIds({ activityId: "a1" }, { activityId: "a1" })).toEqual(["a1"]);
  });
  it("keeps a clean id from a malformed doc and skips missing/unclean ones", () => {
    expect(checkInActivityIds({ activityId: "a1", role: "Boss" }, undefined)).toEqual(["a1"]);
    expect(checkInActivityIds(undefined, { activityId: "a/1" })).toEqual([]);
    expect(checkInActivityIds(undefined, undefined)).toEqual([]);
  });
});
