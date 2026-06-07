import { z } from "zod";

export const PASSWORD_RULES = [
  { id: "len", label: "Al menos 6 caracteres", test: (v: string) => v.length >= 6 },
  { id: "lower", label: "Una letra minúscula", test: (v: string) => /[a-z]/.test(v) },
  { id: "upper", label: "Una letra mayúscula", test: (v: string) => /[A-Z]/.test(v) },
  { id: "digit", label: "Un número", test: (v: string) => /[0-9]/.test(v) },
] as const;

export const passwordSchema = z.string().superRefine((value, ctx) => {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: `La contraseña necesita: ${rule.label.toLowerCase()}.`,
      });
    }
  }
});
