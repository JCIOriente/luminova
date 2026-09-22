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

/** An App Check rejection: NOT a network problem, and not something a NEW LINK can fix.
 *
 *  firebase-functions enforces `enforceAppCheck` itself and rejects a call whose App Check
 *  token is missing or invalid with `unauthenticated` and NO `details.reason`. Without this
 *  branch such a rejection fell through to the untagged case and rendered "revisa tu conexión",
 *  blaming the invitee's connection for a failure that is either our misconfiguration or their
 *  browser.
 *
 *  On THESE two callables `unauthenticated` can only mean App Check. They are unauthenticated
 *  by design and never require a session, and firebase-functions raises this code for exactly
 *  three cases: an INVALID auth token, and App Check missing or invalid under enforcement. An
 *  invitee sends no auth token at all, which is MISSING rather than INVALID and does not
 *  throw — so App Check is the only remaining source. */
function isAttestationRejection(err: unknown): boolean {
  return (err as { code?: unknown } | null | undefined)?.code === "functions/unauthenticated";
}

/** How long to withhold the retry on a blocked attestation.
 *
 *  This branch used to offer NO retry at all, on the reasoning that attestation failure is
 *  permanent. That reasoning was written while `enforceAppCheck` was false, when the only
 *  reachable cause was a browser blocking reCAPTCHA v3 — genuinely permanent for as long as it
 *  stays blocked. Turning enforcement ON adds two causes that are NOT permanent and are, in
 *  the days around this deploy, the LIKELIER ones: the per-product registration gap
 *  `docs/firebase-setup.md` flags as BLOCKING, which an owner fixes in the console while the
 *  invitee is still on the page, and a transient failure to mint a token (reCAPTCHA slow or
 *  briefly unreachable). Withholding the retry sends someone whose problem clears in a minute
 *  away for good.
 *
 *  Not `0`: an immediate button invites hammering an endpoint that, in the misconfigured case,
 *  cannot succeed yet — and teaches the invitee the button does not work. Not the rate-limit
 *  interval either, which is a different server's different promise; this one is ours, so it
 *  gets its own name rather than borrowing INVITE_RETRY_AFTER_SECONDS and silently inheriting
 *  a retune of the server's refill rate. */
const ATTESTATION_RETRY_AFTER_SECONDS = 15;

/** Both remedies, in the order the causes are likely, and deliberately silent about
 *  connections — blaming the invitee's network is the mis-attribution this branch exists to
 *  fix.
 *
 *  "Inténtalo de nuevo en un momento" FIRST, because the transient and misconfigured causes
 *  now dominate and both clear on their own. The browser remedies stay, because for the person
 *  running a content blocker waiting is a trap: a "try later" with no escape hatch would loop
 *  them forever, which is exactly the dead end the old copy avoided and the new copy must not
 *  reintroduce. The operator is named LAST and only as the final fallback — they cannot fix a
 *  blocked extension, and a fresh link would not help either. */
const ATTESTATION_BLOCKED =
  "No pudimos completar la verificación de seguridad. Inténtalo de nuevo en un momento. " +
  "Si sigue fallando, prueba con otro navegador o desactiva las extensiones que bloquean " +
  "contenido — y si aun así no funciona, avisa a la directiva.";

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
/** Not exported: the only consumer is `inviteRefusal` below, and its call site infers the
 *  return type. An exported name nothing imports is dead weight `knip` cannot see, because
 *  types erase before it looks. */
interface InviteRefusal {
  message: string | null;
  /** Headline to render above `message`. Never "Enlace no válido" unless the link truly is. */
  heading: string;
  /** ONE field, not a `retryable` boolean beside it: `null` means a retry cannot help, `0`
   *  means retry now, a positive number means wait that many seconds first. Two fields had to
   *  be set in lockstep at every return below with nothing enforcing the pairing — a new
   *  branch could offer a retry and forget its delay. Callers that want the boolean read
   *  `retryAfterSeconds !== null`. */
  retryAfterSeconds: number | null;
}

export function inviteRefusal(err: unknown): InviteRefusal {
  // A TAGGED reason wins: rate limiting also arrives on an unauthenticated call, but beacon
  // named it, and the tag is more specific than the transport code.
  const reason = refusalReason(err);
  if (reason !== null) {
    const message = REASON_MESSAGES.get(reason) ?? null;
    // One return per outcome rather than two parallel ternaries. The ternaries had to branch
    // on the same conditions in the same order for heading and retry to agree, with nothing
    // enforcing it — which is the very coupling the `retryAfterSeconds` docblock above exists
    // to warn about. A third case now cannot update one and forget the other.
    //
    // Temporary, and the only tagged reason that is: the bucket refills, so the same link
    // works again shortly.
    if (RETRYABLE_REASONS.has(reason)) {
      return {
        message,
        heading: HEADINGS.wait,
        retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS,
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
      return { message, heading: HEADINGS.blocked, retryAfterSeconds: 0 };
    }
    // Known and tagged: the link itself cannot be used again, and its copy says so.
    return { message, heading: HEADINGS.dead, retryAfterSeconds: null };
  }
  if (isAttestationRejection(err)) {
    // Guardrail #4: this is the one failure with no operator surface at all — the invitee sees
    // a dead end and nothing server-side is tagged — so it must at least leave a trace where
    // someone helping them over the shoulder can find it.
    console.error("invite: App Check rejected the call; the invitee cannot redeem", err);
    return {
      message: ATTESTATION_BLOCKED,
      heading: HEADINGS.blocked,
      retryAfterSeconds: ATTESTATION_RETRY_AFTER_SECONDS,
    };
  }
  // Untagged: a network blip. Retryable, and NOT the link's fault.
  return { message: null, heading: HEADINGS.blocked, retryAfterSeconds: 0 };
}

/** The submit path's renderer. Routed through `inviteRefusal` rather than
 *  a message-only reader so the attestation branch surfaces on BOTH paths — `redeemInvite` is
 *  rejected exactly the same way as `describeInvite`, and a form that fell back to "no se pudo
 *  guardar tu contraseña" would hide the real cause at the last step. */
export function inviteErrorMessage(err: unknown, fallback: string): string {
  return inviteRefusal(err).message ?? fallback;
}
