import { describe, it, expect } from "vitest";
import { PASSWORD_RULE_IDS, passwordPolicyViolations } from "@luminova/types/password-policy";
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

  // The extraction's whole point: beacon enforces `passwordPolicyViolations` server-side and
  // this checklist renders the same policy. Two copies that agree today and drift tomorrow
  // would let a password the checklist calls valid be refused by the callable, with the
  // Spanish copy insisting it is fine. Structural, so a divergence fails HERE.
  it("renders exactly the shared policy, rule for rule", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([...PASSWORD_RULE_IDS]);
    for (const value of ["", "abc", "Abc1", "abc123", "ABC123", "Abcdef", "Abc123", "Añ0mbre"]) {
      const failedHere = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.id);
      expect(failedHere).toEqual(passwordPolicyViolations(value));
    }
  });
});
