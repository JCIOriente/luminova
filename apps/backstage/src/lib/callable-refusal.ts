/** Read a callable's own tagged refusal out of its error payload.
 *
 *  Extracted from `features/members/lib/provision-error.ts` at its SECOND occurrence
 *  (guardrail #1): the invite page needs the identical mechanism for `InviteBlockReason`.
 *  Each caller supplies its own exhaustive `Readonly<Record<Reason, string>>`, so
 *  exhaustiveness is still checked against each contract separately — only the lookup is
 *  shared.
 *
 *  A MAP, not an object literal. `reason` is attacker-adjacent input: it arrives inside the
 *  callable's error payload, and `{...}[reason]` resolves "toString" / "constructor" /
 *  "valueOf" to the inherited Object.prototype FUNCTION, which a `?? fallback` then happily
 *  returns as the message — TypeScript types that `string` and React would render a function.
 *  The literal at each call site buys exhaustiveness against the union; the Map buys a safe
 *  lookup. Both are needed; neither substitutes for the other. */
export function refusalMessage(err: unknown, table: ReadonlyMap<string, string>): string | null {
  const reason = refusalReason(err);
  if (reason === null) return null;
  return table.get(reason) ?? null;
}

/** The raw tag, for callers that need to branch on WHICH refusal it was rather than only
 *  render it — the invite page decides retryability from it. Extracted from `refusalMessage`
 *  rather than re-parsed at the call site (guardrail #1): two copies of this unwrapping would
 *  be two places to get the prototype-safety reasoning above wrong. */
export function refusalReason(err: unknown): string | null {
  const details = (err as { details?: unknown } | null | undefined)?.details;
  const reason =
    typeof details === "object" && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  return typeof reason === "string" ? reason : null;
}
