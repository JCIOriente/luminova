import { describe, it, expect } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULE_IDS,
  passwordPolicyViolations,
} from "@luminova/types/password-policy";
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

  // The half this module originally left out. Importing only `passwordPolicyViolations` gave a
  // password that ticks all four checklist rules and is still refused by the callable — and
  // `invite-password-weak`'s copy says "revisa la lista de abajo" while every item in that
  // list is green. An unresolvable dead end on the only onboarding path.
  it("BLOCKING: rejects an over-long password the four rules all accept", () => {
    const tooLong = "Abcde1".repeat(300);
    expect(tooLong.length).toBeGreaterThan(PASSWORD_MAX_LENGTH);
    // Every checklist row reads green...
    expect(passwordPolicyViolations(tooLong)).toEqual([]);
    expect(PASSWORD_RULES.every((r) => r.test(tooLong))).toBe(true);
    // ...and the form must still refuse it, exactly as beacon does.
    expect(passwordSchema.safeParse(tooLong).success).toBe(false);
  });

  it("accepts a password at the maximum length", () => {
    const atLimit = "Abcde1" + "x".repeat(PASSWORD_MAX_LENGTH - 6);
    expect(atLimit.length).toBe(PASSWORD_MAX_LENGTH);
    expect(passwordSchema.safeParse(atLimit).success).toBe(true);
  });
});
