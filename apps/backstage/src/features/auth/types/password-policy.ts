import { z } from "zod";
import {
  PASSWORD_RULE_IDS,
  PASSWORD_MIN_LENGTH,
  passwordPolicyViolations,
  type PasswordRuleId,
} from "@luminova/types/password-policy";

/** The Spanish labels for the checklist. The PREDICATES are not here — they live in
 *  `@luminova/types/password-policy`, which beacon's `redeemInvite` enforces server-side.
 *  Guardrail #1: one definition of the policy, two consumers. A second copy here would let
 *  the checklist tick every box for a password the callable then refuses. */
const LABELS: Readonly<Record<PasswordRuleId, string>> = {
  len: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  lower: "Una letra minúscula",
  upper: "Una letra mayúscula",
  digit: "Un número",
};

export const PASSWORD_RULES = PASSWORD_RULE_IDS.map((id) => ({
  id,
  label: LABELS[id],
  test: (v: string) => !passwordPolicyViolations(v).includes(id),
}));

export const passwordSchema = z.string().superRefine((value, ctx) => {
  // Iterates the SHARED violations rather than re-testing: the order and the set are then
  // beacon's, so a rule added server-side surfaces in this form without a second edit.
  for (const id of passwordPolicyViolations(value)) {
    ctx.addIssue({
      code: "custom",
      message: `La contraseña necesita: ${LABELS[id].toLowerCase()}.`,
    });
  }
});
