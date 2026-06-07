import { z } from "zod";
import { passwordSchema } from "./password-policy";

export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type ResetInput = z.infer<typeof resetSchema>;
