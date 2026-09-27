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
    // The regression this pins: the submit path dropped the refusal's delay and left its
    // button enabled, so each impatient click spent a shared endpoint-wide slot to fail.
    const throttled = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(throttled.message).not.toBeNull();
    expect(throttled.recovery).toEqual({ kind: "retry", afterSeconds: INVITE_RETRY_AFTER_SECONDS });
  });
});

/** The reasons `inviteRefusal` treats as temporary, derived from its OWN behaviour rather than
 *  re-listing `RETRYABLE_REASONS` (which is not exported). A second copy of that list here
 *  would be the drift these tests exist to catch. */
const TEMPORARY_REASONS: ReadonlySet<string> = new Set(
  INVITE_BLOCK_REASONS.filter(
    (reason) => inviteRefusal({ details: { reason } }).recovery.kind !== "none",
  ),
);

describe("inviteRefusal — which refusals a retry can clear", () => {
  it("offers a retry for rate limiting, the one TEMPORARY tagged refusal", () => {
    // The bucket refills a slot every 12 s, so the same link works again shortly. Hiding the
    // retry button here would strand someone whose only mistake was reloading the page.
    const refusal = inviteRefusal({ details: { reason: "invite-too-many-attempts" } });
    expect(refusal.recovery.kind).not.toBe("none");
    expect(refusal.message).toMatch(/segundos/i);
    // And it must NOT tell them to go find an operator — waiting is the entire remedy.
    expect(refusal.message).not.toMatch(/nuevo enlace|te env[ií]e|administrador/i);
  });

  it("offers a retry for an UNTAGGED failure, with no message of its own", () => {
    const refusal = inviteRefusal(new Error("network"));
    expect(refusal.message).toBeNull();
    // `retry` at 0, not `none`: retryable, and immediately — a network blip has no budget to
    // wait out.
    expect(refusal.recovery).toEqual({ kind: "retry", afterSeconds: 0 });
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
      expect(refusal.recovery.kind, reason).toBe("none");
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
      expect(refusal.recovery).toEqual({ kind: "retry", afterSeconds: 0 });
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
    // The rule itself, not one assertion per branch. `recovery: { kind: "none" }` removes the
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
        refusal.recovery.kind,
        `${reason} tells them to act but offers no affordance at all`,
      ).not.toBe("none");
    }
    // The loop must actually have asserted something. Without this a copy edit that drops
    // every "inténtalo de nuevo" turns this into a green test that checks nothing.
    expect(checked).toBeGreaterThan(0);
  });
});

describe("inviteRefusal — an App Check rejection is not a network blip", () => {
  // firebase-functions rejects a call that fails App Check with `unauthenticated` and NO
  // `details.reason`, so it used to land in the untagged branch and render "revisa tu
  // conexión" with a Reintentar button that could never succeed.
  //
  // THREE causes now that enforcement is on, and only the last is permanent: a transient
  // failure to mint a reCAPTCHA token, the per-product registration gap
  // docs/firebase-setup.md calls BLOCKING (an owner fixes it in the console, possibly while
  // the invitee is still on the page), and a browser that blocks reCAPTCHA v3 for as long as
  // it stays blocked. The copy and the retry both have to serve all three.
  const attestationFailure = { code: "functions/unauthenticated", message: "Unauthenticated" };

  it("names the blocked security check without blaming the invitee's connection", () => {
    const refusal = inviteRefusal(attestationFailure);
    expect(refusal.message).toMatch(/verificaci[óo]n de seguridad/i);
    // The mis-attribution this branch exists to fix.
    expect(refusal.message).not.toMatch(/conexi[óo]n/i);
    // And it must not send them chasing a new link — a fresh token changes nothing here.
    expect(refusal.message).not.toMatch(/enlace nuevo|uno nuevo/i);
  });

  it("offers a DELAYED retry, because two of the three causes clear on their own", () => {
    // Withholding it entirely was right while enforcement was off and a content blocker was
    // the only reachable cause. With enforcement on, the transient and misconfigured causes
    // dominate — and a "inténtalo de nuevo en un momento" with no button is the same
    // copy/affordance contradiction fixed for unrecognized tagged reasons above.
    const refusal = inviteRefusal(attestationFailure);
    expect(refusal.recovery.kind).not.toBe("none");
    expect(refusal.recovery.kind === "none" ? 0 : refusal.recovery.afterSeconds).toBeGreaterThan(0);
  });

  it("names the RELOAD in the recovery — the only remedy that clears a 24 h throttle", () => {
    // Not decoration. A 403 from the token exchange (the unregistered-product case, i.e. the
    // BLOCKING owner-op) makes @firebase/app-check set a 24 h backoff on the provider
    // instance, and `throwIfThrottled` runs before any exchange is attempted — so Reintentar
    // cannot succeed for the rest of the day no matter what an owner fixes in the console.
    // Only a reload builds a new provider.
    //
    // THIS IS THE ONE ARM WITH TWO HONEST REMEDIES, which is why it is a kind of its own and
    // not a number: a retry clears the two transient causes, a reload additionally clears the
    // throttle. Asserting the kind pins the behaviour. The predecessor asserted that the
    // Spanish string contained "recarga la página", which pinned a sentence — and a sentence
    // is not an affordance: the invitee had to read it and act on it themselves.
    const refusal = inviteRefusal(attestationFailure);
    expect(refusal.recovery.kind).toBe("retry-or-reload");
  });

  it("no longer spells the reload out in the copy, because the component renders it", () => {
    // The paired negative. If the instruction stayed in the string too, the invitee would be
    // told to reload AND shown a button that does it — and the string would drift from the
    // affordance the next time either is edited. It also let the component keep the reload
    // COST out of the shared copy: free on the load screen, a retyped password on submit, and
    // only the component knows which path it is on.
    const refusal = inviteRefusal(attestationFailure);
    expect(refusal.message).not.toMatch(/recarga/i);
  });

  it("still names the remedies a button cannot perform for them", () => {
    // Both halves are load-bearing. "Try later" alone traps the person running a content
    // blocker in a loop that never resolves; the browser remedies alone send someone whose
    // problem is a five-minute console fix away for good.
    //
    // CONTENT, not order. This test used to pin four remedies by `indexOf` — "recarga" after
    // "de nuevo", "navegador" after "recarga", "directiva" after "navegador" — which made
    // word order the proxy for an affordance decision the type could not hold. It can now, so
    // the ordering that matters (retry, then reload) is asserted where it lives: in the
    // recovery kind above and in the component that renders the two buttons. What is left
    // here is the part no affordance can replace — unblocking an extension and telling the
    // directiva are things only the invitee can do, so the copy must still say them.
    const message = inviteRefusal(attestationFailure).message ?? "";
    expect(message).toMatch(/de nuevo en un momento/i);
    expect(message).toMatch(/navegador/i);
    expect(message).toMatch(/extensi[óo]n|extensiones/i);
    expect(message).toMatch(/directiva/i);
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
    const immediate = { kind: "retry", afterSeconds: 0 };
    expect(inviteRefusal(new Error("network")).recovery).toEqual(immediate);
    expect(inviteRefusal({ code: "functions/unavailable" }).recovery).toEqual(immediate);
    expect(inviteRefusal({ code: "functions/internal" }).recovery).toEqual(immediate);
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
    expect(inviteRefusal(tagged).recovery.kind).not.toBe("none");
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
    expect(inviteRefusal(rateLimited).recovery.kind).not.toBe("none");
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
    expect(refusal.recovery).toEqual({ kind: "retry", afterSeconds: INVITE_RETRY_AFTER_SECONDS });
    // And the derivation itself. A deliberate TRIPWIRE, not a second hardcoded copy: it does
    // not constrain the client, it makes a change to `perTokenPerMinute` or `windowMs` stop
    // here and be acknowledged, since that retune also changes what the invite page promises
    // an invitee. When it fires, update this number — do not route around it.
    expect(INVITE_RETRY_AFTER_SECONDS).toBe(12);
  });

  it("imposes no wait on an ordinary network retry", () => {
    expect(inviteRefusal(new Error("network")).recovery).toEqual({
      kind: "retry",
      afterSeconds: 0,
    });
  });
});

describe("inviteRefusal — a refused MISCONFIGURED service is not a network blip either", () => {
  // beacon refuses every invite call while the deployed service carries FIREBASE_DEBUG_MODE +
  // skipTokenVerification — the environment that makes firebase-functions accept UNSIGNED Auth and
  // App Check tokens. On THIS path the refusal is TAGGED, and the tag is what matters: an untagged
  // error falls to the "revisa tu conexión" branch `isAttestationRejection` was written to remove,
  // and here that is worse still, because the condition lasts as long as the container and the
  // retry loops forever.
  //
  // `failed-precondition`, because that is what beacon actually emits: the invite path raises
  // through `inviteBlocked`, which is hard-coded to that code (provision-errors.ts). The FIRST
  // version of this fixture said `functions/internal` — a shape beacon cannot produce on this
  // path — and passed anyway, because `inviteRefusal` reads `details.reason` before it looks at
  // any code. State that plainly so the next reader does not "correct" the code and believe they
  // changed behaviour: they would not have. What the honest code buys is that a future
  // code-keyed branch added ABOVE the tagged one is exercised by this suite instead of skipped.
  const misconfigured = {
    code: "functions/failed-precondition",
    message: "FAILED_PRECONDITION",
    details: { reason: "invite-service-misconfigured" },
  };

  it("blames our configuration, not the invitee's connection", () => {
    const refusal = inviteRefusal(misconfigured);
    expect(refusal.message).toMatch(/configuraci[óo]n/i);
    expect(refusal.message).not.toMatch(/conexi[óo]n/i);
  });

  it("says the link is still valid, and points at the directiva", () => {
    // Accurate and load-bearing: the token was never consumed — the guard refuses before the
    // claim — so sending them to chase a new link would waste an invite for nothing.
    const refusal = inviteRefusal(misconfigured);
    expect(refusal.message).toMatch(/sigue siendo v[áa]lido/i);
    expect(refusal.message).toMatch(/directiva/i);
  });

  it("withholds the retry affordance, because a retry can NEVER clear it", () => {
    // The defect this whole branch exists for: `{ kind: "retry", afterSeconds: 0 }` handed the
    // invitee an immediate button against a condition fixed for the life of the process.
    expect(inviteRefusal(misconfigured).recovery).toEqual({ kind: "none" });
  });

  it("does not claim the link is dead", () => {
    // `blocked`, not `dead` — "Enlace no válido" over a link that is perfectly valid is the
    // heading/body contradiction HEADINGS was introduced to end.
    expect(inviteRefusal(misconfigured).heading).toBe("No pudimos abrir el enlace");
  });

  it("leaves a console trace for whoever is helping over the shoulder", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      inviteRefusal(misconfigured);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});
