import { describe, it, expect } from "vitest";
import { INVITE_BLOCK_REASONS } from "./invite-block-reason.js";

describe("INVITE_BLOCK_REASONS", () => {
  it("carries no duplicate tag", () => {
    // Same failure shape as PROVISION_BLOCK_REASONS: a duplicate collapses in the union, so
    // the invite page's message table still type-checks as exhaustive with one message gone.
    expect(new Set(INVITE_BLOCK_REASONS).size).toBe(INVITE_BLOCK_REASONS.length);
  });

  it("keeps every tag a stable wire token", () => {
    for (const reason of INVITE_BLOCK_REASONS) {
      expect(reason).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
  });

  it("names every refusal the redemption page must explain", () => {
    // Pinned rather than merely counted: each of these is thrown by a specific branch of
    // redeemInvite/describeInvite, and dropping one degrades that branch to the generic
    // "no longer valid" dead end this contract exists to remove.
    expect([...INVITE_BLOCK_REASONS].sort()).toEqual(
      [
        "invite-account-changed",
        "invite-account-disabled",
        "invite-email-changed",
        "invite-expired",
        "invite-invalid",
        "invite-member-inactive",
        "invite-member-missing",
        "invite-member-now-privileged",
        "invite-password-weak",
        "invite-revoked",
        "invite-service-misconfigured",
        "invite-too-many-attempts",
        "invite-update-failed",
        "invite-used",
      ].sort(),
    );
  });
});
