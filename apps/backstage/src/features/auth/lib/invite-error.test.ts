import { describe, expect, it, vi } from "vitest";
import { INVITE_BLOCK_REASONS, INVITE_RETRY_AFTER_SECONDS } from "@luminova/types";
import { inviteRefusal } from "./invite-error";

describe("inviteRefusal — the Spanish message table", () => {
  it("has a Spanish message for EVERY reason in the contract", () => {
    // Iterates the contract rather than re-listing it, so a reason added in @luminova/types
    // fails here instead of silently degrading to the generic fallback on the invite page.
    for (const reason of INVITE_BLOCK_REASONS) {
      const message = inviteRefusal({ details: { reason } }).message;
      expect(message, reason).not.toBeNull();
      expect(message!.length, reason).toBeGreaterThan(10);
    }
  });

  it("sends a now-privileged member to an ADMINISTRATOR, not back to the issuer", () => {
    // The only remedy is an Admin re-issue: a delegate re-issuing hits the very same guard.
    // The generic "ask whoever invited you" copy would send them to someone who cannot help.
    const message = inviteRefusal({ details: { reason: "invite-member-now-privileged" } }).message;
    expect(message).toMatch(/administrador/i);
  });

  it("keeps expired and used distinct from the generic refusal", () => {
    const expired = inviteRefusal({ details: { reason: "invite-expired" } }).message;
    const used = inviteRefusal({ details: { reason: "invite-used" } }).message;
    const invalid = inviteRefusal({ details: { reason: "invite-invalid" } }).message;
    expect(expired).not.toBe(invalid);
    expect(used).not.toBe(invalid);
    expect(used).toMatch(/sesión/i);
  });

  it("returns null for an untagged or unknown failure", () => {
    expect(inviteRefusal(new Error("network")).message).toBeNull();
    expect(inviteRefusal({ details: { reason: "not-a-reason" } }).message).toBeNull();
  });

  it.each(["toString", "constructor", "__proto__"])("is prototype-safe for %s", (reason) => {
    expect(inviteRefusal({ details: { reason } }).message).toBeNull();
  });
});

describe("what the SUBMIT path renders", () => {
  // The form reads `inviteRefusal` directly — message AND delay. It used to read a
  // message-only wrapper, which is how a throttled submit kept a live button. Only the delay
  // is asserted here: "untagged yields no message" and "a tagged reason has one" are already
  // pinned above, by the untagged test and by the one that iterates INVITE_BLOCK_REASONS, and
  // restating them as submit-path tests would be the same call with the same input.
  it("carries the WAIT, not just the message, on a throttled refusal", () => {
    // The regression this pins: the submit path dropped `retryAfterSeconds` and left its
    // button enabled, so each impatient click spent a shared endpoint-wide slot to fail.
    const throttled = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(throttled.message).not.toBeNull();
    expect(throttled.retryAfterSeconds).toBe(INVITE_RETRY_AFTER_SECONDS);
  });
});

/** The reasons `inviteRefusal` treats as temporary, derived from its OWN behaviour rather than
 *  re-listing `RETRYABLE_REASONS` (which is not exported). A second copy of that list here
 *  would be the drift these tests exist to catch. */
const TEMPORARY_REASONS: ReadonlySet<string> = new Set(
  INVITE_BLOCK_REASONS.filter(
    (reason) => inviteRefusal({ details: { reason } }).retryAfterSeconds !== null,
  ),
);

describe("inviteRefusal — which refusals a retry can clear", () => {
  it("offers a retry for rate limiting, the one TEMPORARY tagged refusal", () => {
    // The bucket refills a slot every 12 s, so the same link works again shortly. Hiding the
    // retry button here would strand someone whose only mistake was reloading the page.
    const refusal = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(refusal.retryAfterSeconds).not.toBeNull();
    expect(refusal.message).toMatch(/segundos/i);
    // And it must NOT tell them to go find an operator — waiting is the entire remedy.
    expect(refusal.message).not.toMatch(/nuevo enlace|te env[ií]e|administrador/i);
  });

  it("offers a retry for an UNTAGGED failure, with no message of its own", () => {
    const refusal = inviteRefusal(new Error("network"));
    expect(refusal.message).toBeNull();
    // 0, not null: retryable, and immediately — a network blip has no budget to wait out.
    expect(refusal.retryAfterSeconds).toBe(0);
  });

  it("refuses a retry for every reason NOT declared temporary", () => {
    // Iterates the contract, so a NEW temporary reason must be added to RETRYABLE_REASONS
    // deliberately rather than inheriting the wrong default.
    //
    // Excluded by asking `inviteRefusal` what it considers temporary rather than by the
    // literal "invite-too-many-attempts". With the literal, this test and the copy/affordance
    // property test below were UNSATISFIABLE together: adding a second temporary reason (the
    // exact change that test instructs) made this one fail, so no state passed both.
    for (const reason of INVITE_BLOCK_REASONS) {
      if (TEMPORARY_REASONS.has(reason)) continue;
      const refusal = inviteRefusal({ details: { reason } });
      expect(refusal.retryAfterSeconds, reason).toBeNull();
      expect(refusal.message, reason).not.toBeNull();
    }
  });

  it.each(["toString", "constructor", "__proto__", "invite-reason-from-a-newer-beacon"])(
    "treats the UNRECOGNIZED tagged reason %s like an unknown failure, not a dead link",
    (reason) => {
      // Two ways to get here: a prototype key reaching the lookup, and a beacon deploying a
      // new InviteBlockReason ahead of this bundle. Neither tells us the link is spent, so we
      // must not claim it is — and we must not withhold the retry either.
      const refusal = inviteRefusal({ details: { reason } });
      expect(refusal.message).toBeNull();
      expect(refusal.heading).not.toMatch(/no v[áa]lido/i);
      // 0, not null. `message` is null, so the form renders GENERIC_LOAD_ERROR — "Revisa tu
      // conexión e inténtalo de nuevo". `null` here removes the Reintentar button, leaving
      // copy that instructs a retry above a screen that offers none.
      expect(refusal.retryAfterSeconds).toBe(0);
    },
  );
});

describe("inviteRefusal — copy and affordance cannot contradict", () => {
  /** Reasons only `redeemInvite` can raise, i.e. only AFTER the invite already validated and
   *  the form is on screen. Their copy renders inline beside a form that stays usable, so
   *  "inténtalo de nuevo" means "fix it and submit again" — there is no error screen and no
   *  Reintentar button to withhold. The load-path rule below genuinely does not apply to them.
   *
   *  Written as an exclusion list rather than by loosening the regex: `invite-password-weak`
   *  SHOULD say "inténtalo de nuevo", and a regex tuned to let it through would also let
   *  through a load-path reason that must not. */
  const SUBMIT_PATH_ONLY: ReadonlySet<string> = new Set([
    // All four are raised inside `redeemInviteFor`, after `loadValidInvite` has already
    // succeeded — `describeInvite` cannot reach any of them. Listing the whole category, not
    // just the one member that trips the rule today: rewording any of the others to say
    // "inténtalo de nuevo" would otherwise fail this test for a screen that has no Reintentar
    // button to withhold in the first place.
    "invite-password-weak",
    "invite-account-changed",
    "invite-account-disabled",
    "invite-member-now-privileged",
  ]);

  it("offers a retry for every LOAD-path message that tells the invitee to try again", () => {
    // The rule itself, not one assertion per branch. `retryAfterSeconds: null` removes the
    // Reintentar button, so any load-path message whose copy instructs a retry must not take
    // that path.
    //
    // This is what makes the invariant hold by construction rather than by someone re-reading
    // a 13-entry table: adding a reason whose Spanish says "inténtalo de nuevo" without adding
    // it to RETRYABLE_REASONS fails HERE, which is exactly how the original defect got in.
    let checked = 0;
    for (const reason of INVITE_BLOCK_REASONS) {
      if (SUBMIT_PATH_ONLY.has(reason)) continue;
      const refusal = inviteRefusal({ details: { reason } });
      if (refusal.message === null) continue;
      if (!/int[ée]ntalo de nuevo|vuelve a intentarlo/i.test(refusal.message)) continue;
      checked += 1;
      expect(
        refusal.retryAfterSeconds,
        `${reason} tells them to retry but offers no button`,
      ).not.toBeNull();
    }
    // The loop must actually have asserted something. Without this a copy edit that drops
    // every "inténtalo de nuevo" turns this into a green test that checks nothing.
    expect(checked).toBeGreaterThan(0);
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
    expect(refusal.retryAfterSeconds).toBeNull();
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
    expect(inviteRefusal(new Error("network")).retryAfterSeconds).toBe(0);
    expect(inviteRefusal({ code: "functions/unavailable" }).retryAfterSeconds).toBe(0);
    expect(inviteRefusal({ code: "functions/internal" }).retryAfterSeconds).toBe(0);
  });

  // "surfaces on the SUBMIT path too" used to live here, exercising the message-only wrapper
  // the form called. With both paths reading `inviteRefusal` directly it became the same call
  // with the same input as the test above and could no longer fail independently, so the
  // submit-path assertion moved to where it can: the component test.

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
    expect(inviteRefusal(tagged).retryAfterSeconds).not.toBeNull();
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
    expect(inviteRefusal(rateLimited).retryAfterSeconds).not.toBeNull();
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
    // Asserted against the SHARED constant, not a literal 12: the whole point of moving the
    // ceilings into @luminova/types is that the client cannot hold its own copy of the
    // server's refill rate. A literal here would be that copy, one layer out.
    expect(refusal.retryAfterSeconds).toBe(INVITE_RETRY_AFTER_SECONDS);
    // And the derivation itself. A deliberate TRIPWIRE, not a second hardcoded copy: it does
    // not constrain the client, it makes a change to `perTokenPerMinute` or `windowMs` stop
    // here and be acknowledged, since that retune also changes what the invite page promises
    // an invitee. When it fires, update this number — do not route around it.
    expect(INVITE_RETRY_AFTER_SECONDS).toBe(12);
  });

  it("imposes no wait on an ordinary network retry", () => {
    expect(inviteRefusal(new Error("network")).retryAfterSeconds).toBe(0);
  });
});
