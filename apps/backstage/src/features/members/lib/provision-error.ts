import type { ProvisionBlockReason } from "@luminova/types";

// provisionMemberLogin tags every refusal it can be argued with using details.reason, so the
// UI can name the actual blocker instead of a dead-end generic failure. Three of the five are
// non-Admin refusals a delegate can hit on a member the client cannot fully evaluate
// (provisionBlockedForNonAdmin sees the member doc, not the Auth directory), and without a
// message each reads as a transient error the operator retries forever.
//
// Keyed by ProvisionBlockReason, the union beacon throws from (@luminova/types) — a renamed
// or added reason is a compile error here rather than a silent fall-through to `fallback`.
// Type-only import: the runtime union array is used by the test, never by the bundle.
const MESSAGES: Readonly<Record<ProvisionBlockReason, string>> = {
  "linked-to-different-login":
    "El miembro ya está vinculado a otro acceso (correo cambiado). Desvincúlalo desde la consola antes de reintentar.",
  "reprovision-requires-admin":
    "Ya existe un acceso para este correo. Pídele a un administrador que lo reenvíe o lo vincule.",
  "granted-member-requires-admin":
    "Este miembro tiene roles o permisos asignados: solo un administrador puede crear su acceso.",
  "power-seat-requires-admin":
    "El cargo de este miembro otorga permisos: solo un administrador puede crear su acceso.",
  "member-email-malformed":
    "El correo guardado de este miembro no es válido. Corrígelo en su ficha antes de crear su acceso.",
};

// A Map, not the object literal above: `reason` is attacker-adjacent input (it arrives in the
// callable's error payload), and `{...}[reason]` resolves "toString" / "constructor" /
// "valueOf" to the inherited Object.prototype FUNCTION, which `?? fallback` then happily
// returns as the message. TypeScript types that `string` and React would render a function.
// The literal buys exhaustiveness against the union; the Map buys a safe lookup.
const REASON_MESSAGES = new Map<string, string>(Object.entries(MESSAGES));

/** The callable's own explanation for a refusal, or null when it did not give one (a
 *  transient failure — App Check, quota, config — or a reason this build does not know).
 *
 *  Separate from `provisionErrorMessage` because the two answer different questions. A caller
 *  that only needs text takes the message; a caller that must also decide WHAT TO SAY NEXT
 *  needs to know whether the server refused on purpose. The invite drawer needs the second:
 *  its headline otherwise tells the operator to retry from the row menu on a refusal only an
 *  Admin can clear, with the real explanation demoted to small print underneath. */
export function provisionRefusalMessage(err: unknown): string | null {
  const details = (err as { details?: unknown } | null | undefined)?.details;
  const reason =
    typeof details === "object" && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (typeof reason !== "string") return null;
  return REASON_MESSAGES.get(reason) ?? null;
}

export function provisionErrorMessage(err: unknown, fallback: string): string {
  return provisionRefusalMessage(err) ?? fallback;
}
