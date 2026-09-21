/** The password policy, as zod-free predicates.
 *
 *  Zero dependencies and its own subpath because BOTH ends need it: backstage wraps it in zod
 *  and renders the Spanish labels (`features/auth/types/password-policy.ts`), and beacon
 *  enforces it inside `redeemInvite`. Claiming a policy that a direct callable invocation
 *  bypasses would be guardrail #6 — a guard named in the docs that gates nothing. The labels
 *  stay on the client: they are UI copy, not policy. */
export const PASSWORD_RULE_IDS = ["len", "lower", "upper", "digit"] as const;

export type PasswordRuleId = (typeof PASSWORD_RULE_IDS)[number];

export const PASSWORD_MIN_LENGTH = 6;

const PREDICATES: Readonly<Record<PasswordRuleId, (value: string) => boolean>> = {
  len: (v) => v.length >= PASSWORD_MIN_LENGTH,
  lower: (v) => /[a-z]/.test(v),
  upper: (v) => /[A-Z]/.test(v),
  digit: (v) => /[0-9]/.test(v),
};

/** Which rules `value` fails, in declaration order. Empty means the policy is satisfied.
 *
 *  Takes `unknown`, not `string`: beacon's caller is an UNAUTHENTICATED callable, so the
 *  value arrives straight off the wire. A non-string reaching `.length` would throw and
 *  surface as an opaque `internal` instead of the tagged refusal the page can explain. */
export function passwordPolicyViolations(value: unknown): PasswordRuleId[] {
  if (typeof value !== "string") return [...PASSWORD_RULE_IDS];
  return PASSWORD_RULE_IDS.filter((id) => !PREDICATES[id](value));
}
