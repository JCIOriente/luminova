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

/** An App Check rejection, which is NOT a network problem and NOT retryable.
 *
 *  firebase-functions enforces `enforceAppCheck` itself and rejects a call whose App Check
 *  token is missing or invalid with `unauthenticated` and NO `details.reason`. Without this
 *  branch such a rejection fell through to the untagged case and rendered "revisa tu conexión"
 *  beside a Reintentar button that could never succeed — blaming the invitee's connection for a
 *  failure that is either our misconfiguration or their browser.
 *
 *  On THESE two callables `unauthenticated` can only mean App Check. They are unauthenticated
 *  by design and never require a session, and firebase-functions raises this code for exactly
 *  three cases: an INVALID auth token, and App Check missing or invalid under enforcement. An
 *  invitee sends no auth token at all, which is MISSING rather than INVALID and does not
 *  throw — so App Check is the only remaining source.
 *
 *  Two ways to reach it, and the second is permanent rather than a deploy slip: the
 *  per-product registration gap `docs/firebase-setup.md` flags as BLOCKING, and any browser
 *  that blocks reCAPTCHA v3 — a privacy extension, a blocked `google.com`, a corporate proxy —
 *  for as long as it stays blocked. `packages/firebase/src/app-check.ts` hard-wires
 *  `ReCaptchaV3Provider`, so there is no fallback attestation path. */
function isAttestationRejection(err: unknown): boolean {
  return (err as { code?: unknown } | null | undefined)?.code === "functions/unauthenticated";
}

/** Deliberately actionable and deliberately silent about connections. Waiting cannot help, and
 *  neither can a new link, so the copy must not send them to the operator for a fresh one. */
const ATTESTATION_BLOCKED =
  "Tu navegador bloqueó la verificación de seguridad, así que no pudimos abrir el enlace. " +
  "Prueba con otro navegador, desactiva las extensiones que bloquean contenido, o avisa a la directiva.";

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
    const retryable = RETRYABLE_REASONS.has(reason);
    const message = REASON_MESSAGES.get(reason) ?? null;
    /** A tagged reason this build does not recognize: a newer beacon deploying ahead of this
     *  bundle, or a prototype key like "toString" reaching the lookup. We know only that
     *  beacon refused — not WHY, and not whether the link survives it. */
    const unrecognized = message === null;
    return {
      message,
      // Retryable == temporary, for tagged reasons: the only member of that set is rate
      // limiting. Everything else KNOWN and tagged means the link itself cannot be used again.
      //
      // An unrecognized reason gets the NEUTRAL heading: we genuinely do not know the link is
      // dead, so saying so would be a guess rendered as a fact — and the body falls back to
      // generic copy that would not match it.
      heading: retryable ? HEADINGS.wait : unrecognized ? HEADINGS.blocked : HEADINGS.dead,
      // ...and it stays RETRYABLE, for the same reason the heading stays neutral. Withholding
      // the retry here was a contradiction the invitee could read: `message` is null, so the
      // form renders GENERIC_LOAD_ERROR — "Revisa tu conexión e inténtalo de nuevo" — with no
      // Reintentar button to obey it. `0` rather than the rate-limit delay: nothing told us to
      // wait, and this is the same treatment the untagged path below gives an unknown failure.
      //
      // NOT a fall-through to the attestation branch: a tag means beacon refused deliberately,
      // and routing it there would console.error an App Check failure that did not happen.
      retryAfterSeconds: retryable ? RATE_LIMIT_RETRY_AFTER_SECONDS : unrecognized ? 0 : null,
    };
  }
  if (isAttestationRejection(err)) {
    // Guardrail #4: this is the one failure with no operator surface at all — the invitee sees
    // a dead end and nothing server-side is tagged — so it must at least leave a trace where
    // someone helping them over the shoulder can find it.
    console.error("invite: App Check rejected the call; the invitee cannot redeem", err);
    return {
      message: ATTESTATION_BLOCKED,
      heading: HEADINGS.blocked,
      retryAfterSeconds: null,
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
