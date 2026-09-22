import { describe, expect, it, vi } from "vitest";
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
    expect(refusal.message).toBeNull();
    expect(refusal.retryable).toBe(true);
    // Immediately — a network blip has no server-side budget to wait out.
    expect(refusal.retryAfterSeconds).toBe(0);
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
    // A prototype key is not a known reason, so it must not come back retryable-with-a-message
    // — and it must not claim the link is invalid, which we have no basis to assert.
    const refusal = inviteRefusal({ details: { reason } });
    expect(refusal.message).toBeNull();
    expect(refusal.retryable).toBe(false);
    expect(refusal.heading).not.toMatch(/no v[áa]lido/i);
  });
});

describe("inviteRefusal — an App Check rejection is not a network blip", () => {
  // firebase-functions rejects a call that fails App Check with `unauthenticated` and NO
  // `details.reason`, so it used to land in the untagged branch and render "revisa tu
  // conexión" with a Reintentar button that could never succeed. Reachable two ways, and the
  // second is permanent: the per-product registration gap docs/firebase-setup.md calls
  // BLOCKING, and any browser that blocks reCAPTCHA v3 (privacy extension, blocked
  // google.com, corporate proxy) for as long as it stays blocked.
  const attestationFailure = { code: "functions/unauthenticated", message: "Unauthenticated" };

  it("names the blocked security check and does NOT offer a retry", () => {
    const refusal = inviteRefusal(attestationFailure);
    expect(refusal.retryable).toBe(false);
    expect(refusal.message).toMatch(/verificaci[óo]n de seguridad/i);
    // Must not blame the invitee's connection — that is the mis-attribution being fixed.
    expect(refusal.message).not.toMatch(/conexi[óo]n/i);
  });

  it("gives an actionable remedy, since waiting cannot help", () => {
    const refusal = inviteRefusal(attestationFailure);
    expect(refusal.message).toMatch(/navegador|extensi[óo]n|directiva/i);
  });

  it("logs it, so a silent lockout leaves a trace in the console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    inviteRefusal(attestationFailure);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still treats a genuine network failure as retryable", () => {
    // The paired negative: the fix must not swallow every untagged error into the
    // attestation bucket.
    expect(inviteRefusal(new Error("network")).retryable).toBe(true);
    expect(inviteRefusal({ code: "functions/unavailable" }).retryable).toBe(true);
    expect(inviteRefusal({ code: "functions/internal" }).retryable).toBe(true);
  });

  it("surfaces on the SUBMIT path too, not only on load", () => {
    // redeemInvite is rejected the same way, and inviteErrorMessage is what the form renders.
    expect(inviteErrorMessage(attestationFailure, "Generic.")).not.toBe("Generic.");
    expect(inviteErrorMessage(attestationFailure, "Generic.")).toMatch(
      /verificaci[óo]n de seguridad/i,
    );
  });

  it("prefers a TAGGED reason over the attestation branch", () => {
    // The fixture carries BOTH signals on purpose — `unauthenticated` AND a tag — because a
    // fixture that satisfies only one cannot pin the ORDER. Beacon does not currently throw a
    // tagged `unauthenticated` (the rate-limit refusal is `resource-exhausted`), so this
    // guards the day one is added: the specific reason must beat the transport code, or that
    // refusal would silently render as "your browser blocked the security check".
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tagged = {
      code: "functions/unauthenticated",
      details: { reason: "invite-too-many-attempts" },
    };
    expect(inviteRefusal(tagged).retryable).toBe(true);
    expect(inviteRefusal(tagged).message).toMatch(/segundos/i);
    // And it must not be logged as an attestation lockout, which it is not.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps the ordinary rate-limit refusal working", () => {
    const rateLimited = {
      code: "functions/resource-exhausted",
      details: { reason: "invite-too-many-attempts" },
    };
    expect(inviteRefusal(rateLimited).retryable).toBe(true);
    expect(inviteRefusal(rateLimited).message).toMatch(/segundos/i);
  });
});

describe("inviteRefusal — the HEADING must not contradict the body", () => {
  // `invite-redeem-form` hardcoded <Heading>Enlace no válido</Heading> above every error. For
  // two states that headline is simply false, and one of them shipped a direct
  // self-contradiction in 31px type: the rate-limit copy says "el enlace sigue siendo válido"
  // while the heading above it said the opposite, to someone who had only reloaded the page.

  it("does not call the link invalid when it is merely throttled", () => {
    const refusal = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(refusal.heading).not.toMatch(/no v[áa]lido/i);
    // And the heading must not contradict its own message.
    expect(refusal.message).toMatch(/sigue siendo v[áa]lido/i);
  });

  it("does not call the link invalid when the browser blocked attestation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refusal = inviteRefusal({ code: "functions/unauthenticated" });
    expect(refusal.heading).not.toMatch(/no v[áa]lido/i);
    spy.mockRestore();
  });

  it("does not call the link invalid on a mere network failure", () => {
    expect(inviteRefusal(new Error("network")).heading).not.toMatch(/no v[áa]lido/i);
  });

  it("DOES call the link invalid when the link really is spent or dead", () => {
    for (const reason of ["invite-expired", "invite-used", "invite-revoked", "invite-invalid"]) {
      expect(inviteRefusal({ details: { reason } }).heading, reason).toMatch(/no v[áa]lido/i);
    }
  });

  it("gives every refusal a non-empty heading", () => {
    for (const reason of INVITE_BLOCK_REASONS) {
      const h = inviteRefusal({ details: { reason } }).heading;
      expect(h, reason).toBeTruthy();
    }
    expect(inviteRefusal(new Error("x")).heading).toBeTruthy();
  });

  it("asks the invitee to wait out the per-token interval before retrying", () => {
    // The copy promises "unos segundos"; the button must honour it rather than offering an
    // immediate retry that spends an endpoint-wide slot and fails.
    const refusal = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(refusal.retryable).toBe(true);
    expect(refusal.retryAfterSeconds).toBe(12);
  });

  it("imposes no wait on an ordinary network retry", () => {
    expect(inviteRefusal(new Error("network")).retryAfterSeconds).toBe(0);
  });
});
