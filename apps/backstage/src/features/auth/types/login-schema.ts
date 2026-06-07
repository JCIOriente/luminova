import { z } from "zod";
import { passwordSchema } from "./password-policy";

export const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido."),
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
