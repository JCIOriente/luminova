import type { InviteBlockReason } from "@luminova/types";
import { refusalMessage } from "../../../lib/callable-refusal";

// Keyed by InviteBlockReason, the union beacon throws from (@luminova/types) — a renamed or
// added reason is a compile error here rather than a silent fall-through to the generic
// "este enlace ya no es válido", which is the dead end this table exists to remove.
//
// The AUDIENCE is the invitee, not an operator: someone who just opened a WhatsApp link and
// has no idea what a cargo or a claim is. Every message says what happened and what to do
// next, in that order.
const MESSAGES: Readonly<Record<InviteBlockReason, string>> = {
  // The four states that collapse to one message on purpose. Distinguishing them would tell
  // the holder about a member record they may have no business knowing, and the remedy is
  // identical for all four.
  "invite-invalid": "Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo.",
  "invite-member-missing":
    "Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo.",
  "invite-member-inactive":
    "Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo.",
  "invite-email-changed":
    "Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo.",
  "invite-account-changed":
    "Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo.",
  // These two keep their own copy: they are the difference between "pide otro" and "ya está
  // listo, solo inicia sesión", and getting them wrong sends the person in a circle.
  "invite-expired":
    "Este enlace ya venció. Pídele a quien te invitó que te envíe uno nuevo — los enlaces duran 7 días.",
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
  // The token is spent and the member still has no password — they cannot simply retry.
  "invite-update-failed":
    "No pudimos guardar tu contraseña y este enlace ya se consumió. Pídele a quien te invitó que te envíe uno nuevo.",
};

// See lib/callable-refusal.ts for why this is a Map and not the literal above.
const REASON_MESSAGES = new Map<string, string>(Object.entries(MESSAGES));

/** Beacon's own explanation for refusing this link, or null when it did not give one (a
 *  network failure, or a reason this build does not know). */
export function inviteRefusalMessage(err: unknown): string | null {
  return refusalMessage(err, REASON_MESSAGES);
}

export function inviteErrorMessage(err: unknown, fallback: string): string {
  return inviteRefusalMessage(err) ?? fallback;
}
