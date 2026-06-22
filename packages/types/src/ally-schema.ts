import { z } from "zod";
import { ALLY_CATEGORIES } from "./engine/ally-public.js";

export const allySchema = z.object({
  companyName: z.string().min(3, "Mínimo 3 caracteres."),
  contactPerson: z.string().min(3, "Mínimo 3 caracteres."),
  phone: z.string().min(1, "Requerido."),
  email: z.string().email("Correo inválido."),
  category: z.enum(ALLY_CATEGORIES).optional(),
});

export type AllyInput = z.infer<typeof allySchema>;
