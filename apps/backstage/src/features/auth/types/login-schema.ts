import { z } from "zod";

// Only non-empty: the strength policy (passwordSchema) is enforced where a password is
// chosen, the invite redeem page. Applying it here would lock out any member whose
// password predates the policy.
export const loginSchema = z.object({
  email: z.string().trim().email("Ingresa un correo válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export type LoginInput = z.infer<typeof loginSchema>;
