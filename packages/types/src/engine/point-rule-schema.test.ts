import { describe, it, expect } from "vitest";
import { pointRuleSchema } from "./point-rule-schema";

describe("pointRuleSchema", () => {
  it("accepts a valid code + non-negative integer points", () => {
    const parsed = pointRuleSchema.parse({
      code: "DirectProgram",
      points: 10,
      label: "Dirección de programa",
    });
    expect(parsed.points).toBe(10);
  });

  it("rejects an unknown code", () => {
    expect(pointRuleSchema.safeParse({ code: "Nope", points: 1, label: "x" }).success).toBe(false);
  });

  it("rejects negative or non-integer points", () => {
    expect(
      pointRuleSchema.safeParse({ code: "DirectProgram", points: -1, label: "x" }).success,
    ).toBe(false);
    expect(
      pointRuleSchema.safeParse({ code: "DirectProgram", points: 1.5, label: "x" }).success,
    ).toBe(false);
  });

  it("requires a non-empty label", () => {
    expect(pointRuleSchema.safeParse({ code: "DirectProgram", points: 1, label: "" }).success).toBe(
      false,
    );
  });
});
