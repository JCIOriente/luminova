import { describe, it, expect } from "vitest";
import { PASSWORD_RULE_IDS, passwordPolicyViolations } from "./password-policy.js";

describe("passwordPolicyViolations", () => {
  it("accepts a password satisfying every rule", () => {
    expect(passwordPolicyViolations("Abcde1")).toEqual([]);
  });

  it("names each unmet rule", () => {
    expect(passwordPolicyViolations("")).toEqual([...PASSWORD_RULE_IDS]);
    expect(passwordPolicyViolations("abcde1")).toEqual(["upper"]);
    expect(passwordPolicyViolations("ABCDE1")).toEqual(["lower"]);
    expect(passwordPolicyViolations("Abcdef")).toEqual(["digit"]);
    expect(passwordPolicyViolations("Abc1")).toEqual(["len"]);
  });

  it("is the SERVER-side policy, so it must not assume a string", () => {
    // beacon calls this on `request.data.password` — unauthenticated, untyped input. A
    // non-string reaching `.length` would throw and surface as `internal` instead of the
    // tagged invite-password-weak the page can explain.
    expect(passwordPolicyViolations(undefined)).toEqual([...PASSWORD_RULE_IDS]);
    expect(passwordPolicyViolations(123456)).toEqual([...PASSWORD_RULE_IDS]);
    expect(passwordPolicyViolations(null)).toEqual([...PASSWORD_RULE_IDS]);
  });

  it("keeps the rule ids duplicate-free and stable", () => {
    expect(new Set(PASSWORD_RULE_IDS).size).toBe(PASSWORD_RULE_IDS.length);
    expect([...PASSWORD_RULE_IDS]).toEqual(["len", "lower", "upper", "digit"]);
  });
});
