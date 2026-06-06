import { describe, it, expect } from "vitest";
import { participationId } from "./participation-id.js";
import { validateCheckIn } from "./check-in.js";

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
});
