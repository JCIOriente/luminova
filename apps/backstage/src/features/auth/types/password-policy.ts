import { z } from "zod";
import {
  PASSWORD_RULE_IDS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  passwordPolicyViolations,
  passwordTooLong,
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
  // The OTHER half of what redeemInvite enforces. Importing only the violations left a dead
  // end this module's own comment describes: beacon refuses a 1500-character passphrase with
  // `invite-password-weak`, whose copy says "revisa la lista de abajo" — while every item in
  // that list is ticked green, because all four rules pass. Nothing on the screen names the
  // actual problem, and the invitee cannot get past it.
  //
  // No matching checklist row: a maximum is not a goal to work toward, and a fifth row that
  // reads green for every realistic password is noise.
  if (passwordTooLong(value)) {
    ctx.addIssue({
      code: "custom",
      message: `La contraseña no puede pasar de ${PASSWORD_MAX_LENGTH} caracteres.`,
    });
  }
});
