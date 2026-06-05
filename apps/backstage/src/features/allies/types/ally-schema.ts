import { z } from "zod";

export const allySchema = z.object({
  companyName: z.string().min(3, "Mínimo 3 caracteres."),
  personInCharge: z.string().min(3, "Mínimo 3 caracteres."),
  phone: z.string().min(1, "Requerido."),
  email: z.string().email("Correo inválido."),
});

export type AllyInput = z.infer<typeof allySchema>;
