import { describe, it, expect } from "vitest";
import { fakeTimestamp } from "../doc-schema-test-helpers.js";
import { participationDocSchema } from "./participation-doc-schema";

const validDoc = {
  memberId: "member-1",
  termId: "2026",
  activityId: "activity-1",
  parentType: "Program",
  parentId: "program-1",
  role: "Director",
  pointRuleCode: "DirectProgram",
  basePoints: 10,
  punctualityFactor: 1,
  computedPoints: 10,
  monthBucket: "2026-01",
  state: "confirmed",
  gates: { attendanceRegistered: true, finalReportFiled: true },
  checkInAt: fakeTimestamp,
  voidReason: null,
  createdAt: fakeTimestamp,
};

describe("participationDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = participationDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, createdAt: "2026-01-01T00:00:00.000Z" };
    expect(participationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a punctualityFactor outside {1, 0.5}", () => {
    const malformed = { ...validDoc, punctualityFactor: 0.75 };
    expect(participationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unknown pointRuleCode", () => {
    const malformed = { ...validDoc, pointRuleCode: "Nope" };
    expect(participationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = participationDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
