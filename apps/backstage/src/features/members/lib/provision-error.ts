// provisionMemberLogin tags every refusal it can be argued with using details.reason, so the
// UI can name the actual blocker instead of a dead-end generic failure. Three of the four are
// non-Admin refusals a delegate can hit on a member the client cannot fully evaluate
// (provisionBlockedForNonAdmin sees the member doc, not the Auth directory), and without a
// message each reads as a transient error the operator retries forever.
// A Map, not an object literal: `reason` is attacker-adjacent input (it arrives in the
// callable's error payload), and `{...}[reason]` resolves "toString" / "constructor" /
// "valueOf" to the inherited Object.prototype FUNCTION, which `?? fallback` then happily
// returns as the message. TypeScript types that `string` and React would render a function.
const REASON_MESSAGES = new Map<string, string>([
  [
    "linked-to-different-login",
    "El miembro ya está vinculado a otro acceso (correo cambiado). Desvincúlalo desde la consola antes de reintentar.",
  ],
  [
    "reprovision-requires-admin",
    "Ya existe un acceso para este correo. Pídele a un administrador que lo reenvíe o lo vincule.",
  ],
  [
    "granted-member-requires-admin",
    "Este miembro tiene roles o permisos asignados: solo un administrador puede crear su acceso.",
  ],
  [
    "power-seat-requires-admin",
    "El cargo de este miembro otorga permisos: solo un administrador puede crear su acceso.",
  ],
]);

export function provisionErrorMessage(err: unknown, fallback: string): string {
  const details = (err as { details?: unknown } | null | undefined)?.details;
  const reason =
    typeof details === "object" && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (typeof reason !== "string") return fallback;
  return REASON_MESSAGES.get(reason) ?? fallback;
}
