import { z } from "zod";
import { ALLY_CATEGORIES } from "./engine/ally-public.js";
import { boliviaPhoneRequired } from "./phone.js";

export const allySchema = z.object({
  companyName: z.string().trim().min(3, "Mínimo 3 caracteres."),
  contactPerson: z.string().trim().min(3, "Mínimo 3 caracteres."),
  phone: boliviaPhoneRequired,
  email: z.string().trim().email("Correo inválido."),
  category: z.enum(ALLY_CATEGORIES).optional(),
});

export type AllyInput = z.infer<typeof allySchema>;
