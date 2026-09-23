import { INVITE_RETRY_AFTER_SECONDS, type InviteBlockReason } from "@luminova/types";
import { refusalReason } from "../../../lib/callable-refusal";

// Keyed by InviteBlockReason, the union beacon throws from (@luminova/types) — a renamed or
// added reason is a compile error here rather than a silent fall-through to the generic
// "este enlace ya no es válido", which is the dead end this table exists to remove.
//
// The AUDIENCE is the invitee, not an operator: someone who just opened a WhatsApp link and
// has no idea what a cargo or a claim is. Every message says what happened and what to do
// next, in that order.
/** The four states that collapse to ONE message. Named once rather than pasted five times:
 *  a wording tweak that landed on four of five would silently split the group the comment
 *  below says is deliberate. */
const GENERIC_INVALID =
  "Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo.";

const MESSAGES: Readonly<Record<InviteBlockReason, string>> = {
  // The four states that collapse to one message on purpose. Distinguishing them would tell
  // the holder about a member record they may have no business knowing, and the remedy is
  // identical for all four.
  "invite-invalid": GENERIC_INVALID,
  "invite-member-missing": GENERIC_INVALID,
  "invite-member-inactive": GENERIC_INVALID,
  "invite-email-changed": GENERIC_INVALID,
  "invite-account-changed": GENERIC_INVALID,
  // These two keep their own copy: they are the difference between "pide otro" and "ya está
  // listo, solo inicia sesión", and getting them wrong sends the person in a circle.
  "invite-expired":
    "Este enlace ya venció. Pídele a quien te invitó que te envíe uno nuevo — los enlaces duran 48 horas.",
  "invite-used":
    "Este enlace ya se usó. Si fuiste tú, inicia sesión con tu contraseña; si no, avisa a la directiva.",
  "invite-revoked":
    "Se generó un enlace más reciente y este dejó de funcionar. Busca el último que te enviaron.",
  // NOT the generic copy: the only remedy is an ADMINISTRATOR re-issuing, because a delegate
  // re-issuing hits the very same guard. Sending them back to "quien te invitó" would send
  // them to someone who cannot help.
  "invite-member-now-privileged":
    "Tu cuenta ahora tiene permisos especiales, así que este enlace dejó de servir. Pídele a un administrador que te genere uno nuevo.",
  "invite-account-disabled":
    "Tu cuenta está deshabilitada. Comunícate con la directiva antes de crear tu contraseña.",
  "invite-password-weak":
    "Esa contraseña no cumple los requisitos. Revisa la lista de abajo e inténtalo de nuevo.",
  // The only TEMPORARY refusal. The bucket refills one slot every 12 s, so "unos segundos" is
  // the literal truth rather than a softener — and the copy must not send them to an operator,
  // because waiting is the whole remedy and a new link would not help.
  "invite-too-many-attempts":
    "Demasiados intentos. Espera unos segundos y vuelve a intentarlo — el enlace sigue siendo válido.",
  // OUR misconfiguration, not the invitee's connection and not the link. Names the directiva
  // because telling someone who can fix the deployment is the only remedy they have, and says
  // the link survives so they do not burn a fresh invite for nothing.
  //
  // NO "vuelve a intentarlo" clause, deliberately: this reason takes `recovery: none`, and the
  // copy/affordance guard in the tests fails any load-path message that instructs a retry while
  // withholding the button. Telling someone to retry a condition that lasts as long as the
  // container is the defect, not the wording.
  "invite-service-misconfigured":
    "No pudimos abrir el enlace por un problema de configuración de nuestro servidor. El enlace sigue siendo válido: avisa a la directiva para que lo revise.",
  // The token is spent and the member still has no password — they cannot simply retry.
  "invite-update-failed":
    "No pudimos guardar tu contraseña y este enlace ya se consumió. Pídele a quien te invitó que te envíe uno nuevo.",
};

// See lib/callable-refusal.ts for why this is a Map and not the literal above.
const REASON_MESSAGES = new Map<string, string>(Object.entries(MESSAGES));

/** The refusals a retry can actually clear.
 *
 *  `retryable` used to be simply "beacon gave no tagged reason", on the stated grounds that
 *  every tagged refusal is permanent for this token. Rate limiting is the first tagged reason
 *  that is TEMPORARY, so that shorthand would hide the retry affordance from the one person
 *  whose only problem is having reloaded the page twice. Keyed on the reason rather than on
 *  the error code so the rule stays next to the message table it must agree with. */
const RETRYABLE_REASONS: ReadonlySet<string> = new Set<InviteBlockReason>([
  "invite-too-many-attempts",
]);

/** Tagged refusals where the LINK IS FINE and the fault is ours.
 *
 *  The tagged path otherwise ends in `HEADINGS.dead` ("Enlace no válido") with no retry, which is
 *  correct for every reason naming a spent, expired or superseded token — and a lie for this one.
 *  `invite-service-misconfigured` means beacon refused BEFORE claiming the token, so the link is
 *  untouched and works once the deployment is fixed: neutral heading, and still no retry, because
 *  the condition lasts as long as the container.
 *
 *  A SET, not an `if`, for two reasons: the next such refusal joins a list instead of adding a
 *  branch, and the heading/recovery pairing stays in one place — the coupling the `recovery`
 *  docblock warns about. */
const OUR_FAULT_REASONS: ReadonlySet<string> = new Set<InviteBlockReason>([
  "invite-service-misconfigured",
]);

/** An App Check rejection: NOT a network problem, and not something a NEW LINK can fix.
 *
 *  firebase-functions enforces `enforceAppCheck` itself and rejects a call whose App Check
 *  token is missing or invalid with `unauthenticated` and NO `details.reason`. Without this
 *  branch such a rejection fell through to the untagged case and rendered "revisa tu conexión",
 *  blaming the invitee's connection for a failure that is either our misconfiguration or their
 *  browser.
 *
 *  On THESE two callables `unauthenticated` is ALMOST always App Check. They are
 *  unauthenticated by design and never require a session, and firebase-functions raises this
 *  code for exactly three cases: an INVALID auth token, and App Check missing or invalid under
 *  enforcement. The ordinary invitee sends no auth token at all, which is MISSING rather than
 *  INVALID and does not throw — so App Check is the only remaining source for them.
 *
 *  THE ONE CASE THIS MIS-DIAGNOSES, stated rather than quietly dropped. `checkAuthToken`
 *  returns INVALID when `verifyIdToken` throws, and firebase-functions checks auth BEFORE App
 *  Check, so it wins the race and produces the identical untagged `unauthenticated`. Reaching
 *  it needs a browser that is ALREADY signed in — an operator testing a link, or a member
 *  opening one in a tab holding a session the SDK can no longer refresh (revoked, or a deleted
 *  user). That person then gets ATTESTATION_BLOCKED: reload, try another browser, disable
 *  extensions, tell the directiva — none of which is the remedy, which is to sign out.
 *
 *  Not special-cased here because the client cannot tell the two apart from the error alone,
 *  and guessing wrong would send a genuinely blocked invitee to sign out of an account they do
 *  not have. It is rare, it is recoverable, and the operator-facing path in
 *  docs/firebase-setup.md is where a stuck tester gets diagnosed. If it ever shows up in
 *  support traffic, the fix is a sign-out clause in ATTESTATION_BLOCKED gated on
 *  `getAuth().currentUser !== null`, not a broader guess here. */
function isAttestationRejection(err: unknown): boolean {
  return (err as { code?: unknown } | null | undefined)?.code === "functions/unauthenticated";
}

/** How long to withhold the retry on a blocked attestation.
 *
 *  Read by the SUBMIT path only. On the load screen a reload strictly dominates a retry — it
 *  re-runs `describeInvite` AND builds a new App Check provider, and costs the invitee
 *  nothing — so the component offers the reload there instead and withholds nothing.
 *
 *  This branch used to offer NO retry, on the reasoning that attestation failure is permanent.
 *  That was written while `enforceAppCheck` was false, when a browser blocking reCAPTCHA v3
 *  was the only reachable cause. Enforcement adds two causes that a retry DOES clear:
 *
 *    - `recaptcha-error` — the grecaptcha script failed to load or execute. Thrown before the
 *      token exchange is attempted and sets no backoff at all, so the next attempt is clean.
 *    - a non-403/404 `fetch-status-error` — a 5xx or a blip from the exchange endpoint. The
 *      SDK's own backoff here is `calculateBackoffMillis(0, 1000, 2)`, about a second.
 *
 *  15 s comfortably covers both. Not `0`, which invites hammering and teaches the invitee the
 *  button does not work; not the rate-limit interval, which is the server's promise about a
 *  different mechanism — so this gets its own name rather than inheriting a retune of
 *  `INVITE_RETRY_AFTER_SECONDS`.
 *
 *  WHAT 15 s DOES NOT CLEAR, and the reason `retry-or-reload` exists as its own arm. The
 *  per-product registration gap — the BLOCKING owner-op in `docs/firebase-setup.md` —
 *  surfaces as a 403
 *  from the token exchange, and `@firebase/app-check`'s `setBackoff` special-cases 403/404
 *  with a TWENTY-FOUR HOUR `allowRequestsAfter`. `throwIfThrottled` is the first statement of
 *  `ReCaptchaV3Provider.getToken()`, and the throttle lives on the provider instance
 *  `initAppCheck` creates once per page load — so for the rest of that day this tab never even
 *  attempts an exchange, and `getToken` returns a DUMMY token rather than throwing, which the
 *  server rejects identically. An owner fixing the console sixty seconds later changes nothing
 *  for that tab. Only a reload builds a new provider. */
const ATTESTATION_RETRY_AFTER_SECONDS = 15;

/** Every remedy that can actually work, in the order their causes are likely, and deliberately
 *  silent about connections — blaming the invitee's network is the mis-attribution this branch
 *  exists to fix.
 *
 *  Retry first: it clears the two transient causes and costs nothing. Then the browser
 *  remedies, for the person running a content blocker, for whom waiting is a trap with no
 *  exit. The operator is LAST: they cannot unblock an extension, and a fresh link would not
 *  help either.
 *
 *  THE RELOAD IS NOT IN THIS STRING, deliberately. It is the only remedy for a 24 h App Check
 *  throttle (see ATTESTATION_RETRY_AFTER_SECONDS), which makes it too important to be a clause
 *  someone has to read and act on manually — and its COST differs by path: free on the load
 *  screen, a retyped password on submit. So the refusal names it in `recovery` and the
 *  component renders it, with the warning the submit path owes. An earlier version put it here
 *  as prose, and the tests could then only pin it by `indexOf` against three other remedies. */
const ATTESTATION_BLOCKED =
  "No pudimos completar la verificación de seguridad. Inténtalo de nuevo en un momento. " +
  "Si sigue fallando, prueba con otro navegador o desactiva las extensiones que bloquean " +
  "contenido, y avisa a la directiva.";

/** The headline above the message.
 *
 *  The invite page used to hardcode "Enlace no válido" above EVERY error, and for three states
 *  that is false. The worst was a direct self-contradiction in 31px type: the rate-limit body
 *  copy says "el enlace sigue siendo válido" while the headline above it said the opposite, to
 *  someone whose only mistake was reloading the page. A network blip and a blocked attestation
 *  are equally not the link's fault. */
const HEADINGS = {
  /** The link really is spent, expired, superseded or unknown. */
  dead: "Enlace no válido",
  /** Temporary and self-healing — the link is fine. */
  wait: "Demasiados intentos",
  /** Something between the invitee and us failed; the link is untouched. */
  blocked: "No pudimos abrir el enlace",
} as const;

/** How long to withhold the retry affordance.
 *
 *  IMPORTED, not re-derived. It is the server's own per-token emission interval — 5 calls per
 *  60 s means one slot every 12 s — and it lives in `@luminova/types` precisely so the client
 *  cannot hold a second, silently drifting copy of the server's refill rate. An earlier draft
 *  hard-coded 12 here under a comment claiming the two "cannot drift apart", which was the
 *  drift it disclaimed: retuning `perTokenPerMinute` to 4 would make the server refill every
 *  15 s while this promised 12, and nothing would fail. */
const RATE_LIMIT_RETRY_AFTER_SECONDS = INVITE_RETRY_AFTER_SECONDS;

/** What the load path needs: the message to show and whether offering a retry is honest.
 *
 *  An UNTAGGED failure is retryable (a network blip), a tagged one only if its reason is in
 *  `RETRYABLE_REASONS`. Returned together so a caller cannot take the message and decide
 *  retryability by its own rule. */
/** What the invitee can actually DO about a refusal.
 *
 *  A TAGGED KIND, not the `retryAfterSeconds: number | null` this replaces. That field carried
 *  three meanings at once — `null` "a retry cannot help", `0` "retry now", positive "wait this
 *  long first" — and the attestation branch needed a fourth it had no way to express: a retry
 *  MIGHT work, but only a page reload clears the 24 h App Check hold. With nowhere to put it,
 *  that meaning went into the Spanish copy as a sentence, and the tests could only pin it by
 *  `indexOf` against the three other remedies in the same string — word order standing in for
 *  behaviour. The `retryAfterSeconds` name also asserted something false there: it means "the
 *  server promised a wait this long", and on the attestation branch no server promised
 *  anything.
 *
 *  It stops at naming the remedy. WHICH affordance to render, and in what order, is the
 *  component's call, because only the component knows what a reload costs on the path it is
 *  rendering: nothing on the load screen, a typed-but-unsaved password on submit. */
export type InviteRecovery =
  /** The link itself is spent, expired, superseded or unknown. No button here is honest. */
  | { kind: "none" }
  /** A retry clears it. `afterSeconds` is `0` for "now", positive for a promised wait. */
  | { kind: "retry"; afterSeconds: number }
  /** A retry MAY clear it — two of the three attestation causes are transient — but only a
   *  reload builds the new App Check provider a 24 h 403 throttle requires. Both affordances
   *  are honest; `ATTESTATION_RETRY_AFTER_SECONDS` above is why, and which comes first is the
   *  component's decision, not this file's. */
  | { kind: "retry-or-reload"; afterSeconds: number };

/** Not exported, unlike `InviteRecovery` above: the only consumer is `inviteRefusal` below and
 *  its call site infers the return type, so exporting it would add a name nothing imports.
 *
 *  That IS caught, contrary to what this comment used to claim. `knip` reports unused exported
 *  TYPES as well as values — verified by exporting an unimported type from this file and
 *  watching `pnpm knip` fail on an "Unused exported types" line, not by reasoning about when
 *  types erase. The recovery's export is load-bearing and provably so: the form imports it,
 *  stores it on its error phase, and switches the affordance on its kind. */
interface InviteRefusal {
  message: string | null;
  /** Headline to render above `message`. Never "Enlace no válido" unless the link truly is. */
  heading: string;
  /** ONE field, not a `retryable` boolean beside a delay: two fields had to be set in lockstep
   *  at every return below with nothing enforcing the pairing — a new branch could offer a
   *  retry and forget its delay. Callers that want the boolean read `kind !== "none"`. */
  recovery: InviteRecovery;
}

export function inviteRefusal(err: unknown): InviteRefusal {
  // A TAGGED reason wins: rate limiting also arrives on an unauthenticated call, but beacon
  // named it, and the tag is more specific than the transport code.
  const reason = refusalReason(err);
  if (reason !== null) {
    const message = REASON_MESSAGES.get(reason) ?? null;
    // One return per outcome rather than two parallel ternaries. The ternaries had to branch
    // on the same conditions in the same order for heading and retry to agree, with nothing
    // enforcing it — which is the very coupling the `recovery` docblock above exists
    // to warn about. A third case now cannot update one and forget the other.
    //
    // Temporary, and the only tagged reason that is: the bucket refills, so the same link
    // works again shortly.
    if (RETRYABLE_REASONS.has(reason)) {
      return {
        message,
        heading: HEADINGS.wait,
        recovery: { kind: "retry", afterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS },
      };
    }
    // A tagged reason this build does not recognize: a newer beacon deploying ahead of this
    // bundle, or a prototype key like "toString" reaching the lookup. We know only that beacon
    // refused — not WHY, and not whether the link survives it. So: the NEUTRAL heading, since
    // claiming the link is dead would be a guess rendered as fact, and a retry, since
    // withholding it leaves the invitee reading GENERIC_LOAD_ERROR ("Revisa tu conexión e
    // inténtalo de nuevo") with no button to obey it. `0`, not the rate-limit delay — nothing
    // told us to wait, and this is what the untagged path below gives an unknown failure.
    //
    // NOT a fall-through to the attestation branch: a tag means beacon refused deliberately,
    // and routing it there would console.error an App Check failure that did not happen.
    if (message === null) {
      return { message, heading: HEADINGS.blocked, recovery: { kind: "retry", afterSeconds: 0 } };
    }
    // Tagged, known, and OUR fault: the link is untouched, so the neutral heading. Still no
    // retry — a service env var does not clear because someone pressed a button.
    if (OUR_FAULT_REASONS.has(reason)) {
      console.error("invite: beacon refused the call as misconfigured", err);
      return { message, heading: HEADINGS.blocked, recovery: { kind: "none" } };
    }
    // Known and tagged: the link itself cannot be used again, and its copy says so.
    return { message, heading: HEADINGS.dead, recovery: { kind: "none" } };
  }
  if (isAttestationRejection(err)) {
    // Guardrail #4: this is the one failure with no operator surface at all — the invitee sees
    // a dead end and nothing server-side is tagged — so it must at least leave a trace where
    // someone helping them over the shoulder can find it.
    console.error("invite: App Check rejected the call; the invitee cannot redeem", err);
    return {
      message: ATTESTATION_BLOCKED,
      heading: HEADINGS.blocked,
      recovery: { kind: "retry-or-reload", afterSeconds: ATTESTATION_RETRY_AFTER_SECONDS },
    };
  }
  // Untagged: a network blip. Retryable, and NOT the link's fault.
  return { message: null, heading: HEADINGS.blocked, recovery: { kind: "retry", afterSeconds: 0 } };
}
