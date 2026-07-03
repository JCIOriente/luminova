// provisionMemberLogin tags its uid-conflict rejection with details.reason so
// the UI can point the operator at the console unlink instead of a dead-end
// generic failure (the callable refuses to relink a member whose stored uid
// still resolves to a live, different Auth account).
export function provisionErrorMessage(err: unknown, fallback: string): string {
  const details = (err as { details?: unknown } | null | undefined)?.details;
  const reason =
    typeof details === "object" && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (reason === "linked-to-different-login") {
    return "El miembro ya está vinculado a otro acceso (correo cambiado). Desvincúlalo desde la consola antes de reintentar.";
  }
  return fallback;
}
