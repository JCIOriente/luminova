import { describe, it, expect } from "vitest";
import { checkInSchema } from "./check-in-schema";

const base = { memberId: "m-1", activityId: "a-1", role: "Attendee" as const };

describe("checkInSchema", () => {
  it("accepts a clean attendee check-in", () => {
    expect(checkInSchema.safeParse(base).success).toBe(true);
  });

  it("accepts the other participation roles", () => {
    for (const role of ["Director", "CoDirector", "Team"] as const) {
      expect(checkInSchema.safeParse({ ...base, role }).success).toBe(true);
    }
  });

  it("rejects an unknown role", () => {
    expect(checkInSchema.safeParse({ ...base, role: "Boss" }).success).toBe(false);
  });

  it("rejects ids containing path/composite separators", () => {
    expect(checkInSchema.safeParse({ ...base, memberId: "a/b" }).success).toBe(false);
    expect(checkInSchema.safeParse({ ...base, activityId: "a__b" }).success).toBe(false);
  });

  it("rejects empty ids", () => {
    expect(checkInSchema.safeParse({ ...base, memberId: "" }).success).toBe(false);
  });
});
