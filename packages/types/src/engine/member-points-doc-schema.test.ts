import { describe, it, expect } from "vitest";
import { memberPointsDocSchema } from "./member-points-doc-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

const validDoc = {
  memberId: "member-1",
  termId: "2026",
  cumulative: 42,
  byMonth: { "2026-01": 10, "2026-02": 32 },
  updatedAt: ts,
};

describe("memberPointsDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = memberPointsDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(memberPointsDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a byMonth map with non-numeric values", () => {
    const malformed = { ...validDoc, byMonth: { "2026-01": "10" } };
    expect(memberPointsDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = memberPointsDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
