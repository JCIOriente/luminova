import { describe, it, expect } from "vitest";
import { PASSWORD_RULES, passwordSchema } from "./password-policy";

describe("passwordSchema", () => {
  it("accepts a compliant password", () => {
    expect(passwordSchema.safeParse("Abc123").success).toBe(true);
  });
  it.each([
    ["too short", "Abc1"],
    ["no upper", "abc123"],
    ["no lower", "ABC123"],
    ["no digit", "Abcdef"],
  ])("rejects (%s)", (_label, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
  it("exposes the four rules in order", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["len", "lower", "upper", "digit"]);
  });
});
