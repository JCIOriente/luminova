import { describe, expect, it } from "vitest";
import { checkInRecordDocSchema } from "./check-in-record-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

describe("checkInRecordDocSchema", () => {
  it("parses a resolved check-in doc", () => {
    const parsed = checkInRecordDocSchema.parse({
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
      checkInAt: ts,
    });
    expect(parsed.memberId).toBe("m1");
    expect(parsed.role).toBe("Attendee");
    expect(parsed.checkInAt).toBe(ts);
    expect(parsed).not.toHaveProperty("activityId");
  });

  it("defaults checkInAt to null in the unresolved serverTimestamp window", () => {
    expect(
      checkInRecordDocSchema.parse({ memberId: "m1", role: "Attendee", checkInAt: null }).checkInAt,
    ).toBeNull();
    expect(checkInRecordDocSchema.parse({ memberId: "m1", role: "Attendee" }).checkInAt).toBeNull();
  });

  it("rejects an unknown role", () => {
    expect(
      checkInRecordDocSchema.safeParse({ memberId: "m1", role: "Ghost", checkInAt: null }).success,
    ).toBe(false);
  });
});
