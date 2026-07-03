import { describe, it, expect } from "vitest";
import { pointRuleDocSchema } from "./point-rule-doc-schema";

const validDoc = {
  termId: "2026",
  code: "DirectProgram",
  points: 10,
  label: "Dirección de programa",
};

describe("pointRuleDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = pointRuleDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (wrong type for points)", () => {
    const malformed = { ...validDoc, points: "10" };
    expect(pointRuleDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unknown code", () => {
    const malformed = { ...validDoc, code: "Nope" };
    expect(pointRuleDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = pointRuleDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
