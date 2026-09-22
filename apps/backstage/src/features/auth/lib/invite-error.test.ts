import { describe, expect, it } from "vitest";
import { INVITE_BLOCK_REASONS } from "@luminova/types";
import { inviteErrorMessage, inviteRefusal, inviteRefusalMessage } from "./invite-error";

describe("inviteRefusalMessage", () => {
  it("has a Spanish message for EVERY reason in the contract", () => {
    // Iterates the contract rather than re-listing it, so a reason added in @luminova/types
    // fails here instead of silently degrading to the generic fallback on the invite page.
    for (const reason of INVITE_BLOCK_REASONS) {
      const message = inviteRefusalMessage({ details: { reason } });
      expect(message, reason).not.toBeNull();
      expect(message!.length, reason).toBeGreaterThan(10);
    }
  });

  it("sends a now-privileged member to an ADMINISTRATOR, not back to the issuer", () => {
    // The only remedy is an Admin re-issue: a delegate re-issuing hits the very same guard.
    // The generic "ask whoever invited you" copy would send them to someone who cannot help.
    const message = inviteRefusalMessage({ details: { reason: "invite-member-now-privileged" } });
    expect(message).toMatch(/administrador/i);
  });

  it("keeps expired and used distinct from the generic refusal", () => {
    const expired = inviteRefusalMessage({ details: { reason: "invite-expired" } });
    const used = inviteRefusalMessage({ details: { reason: "invite-used" } });
    const invalid = inviteRefusalMessage({ details: { reason: "invite-invalid" } });
    expect(expired).not.toBe(invalid);
    expect(used).not.toBe(invalid);
    expect(used).toMatch(/sesión/i);
  });

  it("returns null for an untagged or unknown failure", () => {
    expect(inviteRefusalMessage(new Error("network"))).toBeNull();
    expect(inviteRefusalMessage({ details: { reason: "not-a-reason" } })).toBeNull();
  });

  it.each(["toString", "constructor", "__proto__"])("is prototype-safe for %s", (reason) => {
    expect(inviteRefusalMessage({ details: { reason } })).toBeNull();
  });
});

describe("inviteErrorMessage", () => {
  it("falls back when the failure is untagged", () => {
    expect(inviteErrorMessage(new Error("boom"), "Generic.")).toBe("Generic.");
  });

  it("prefers the tagged message", () => {
    expect(inviteErrorMessage({ details: { reason: "invite-expired" } }, "Generic.")).not.toBe(
      "Generic.",
    );
  });
});

describe("inviteRefusal — which refusals a retry can clear", () => {
  it("offers a retry for rate limiting, the one TEMPORARY tagged refusal", () => {
    // The bucket refills a slot every 12 s, so the same link works again shortly. Hiding the
    // retry button here would strand someone whose only mistake was reloading the page.
    const refusal = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(refusal.retryable).toBe(true);
    expect(refusal.message).toMatch(/segundos/i);
    // And it must NOT tell them to go find an operator — waiting is the entire remedy.
    expect(refusal.message).not.toMatch(/nuevo enlace|te env[ií]e|administrador/i);
  });

  it("offers a retry for an UNTAGGED failure, with no message of its own", () => {
    const refusal = inviteRefusal(new Error("network"));
    expect(refusal).toEqual({ message: null, retryable: true });
  });

  it("refuses a retry for every OTHER reason in the contract", () => {
    // Iterates the contract, so a NEW temporary reason must be added to RETRYABLE_REASONS
    // deliberately rather than inheriting the wrong default.
    for (const reason of INVITE_BLOCK_REASONS) {
      if (reason === "invite-too-many-attempts") continue;
      const refusal = inviteRefusal({ details: { reason } });
      expect(refusal.retryable, reason).toBe(false);
      expect(refusal.message, reason).not.toBeNull();
    }
  });

  it.each(["toString", "constructor", "__proto__"])("is prototype-safe for %s", (reason) => {
    // A prototype key is not a known reason, so it must not come back retryable-with-a-message.
    expect(inviteRefusal({ details: { reason } })).toEqual({ message: null, retryable: false });
  });
});
