import { z } from "zod";
import { LEAD_INTENTS } from "./lead.js";

/** Public contact-form input. The write path adds status/source/createdAt/deletedAt. */
export const leadSchema = z.object({
  name: z.string().trim().min(1, "Ingresa tu nombre.").max(100, "Máximo 100 caracteres."),
  email: z
    .string()
    .trim()
    .min(1, "Ingresa tu email.")
    .max(200, "Máximo 200 caracteres.")
    .email("Email no válido."),
  intent: z.enum(LEAD_INTENTS),
  message: z
    .string()
    .trim()
    .min(1, "Cuéntanos qué te trae por aquí.")
    .max(2000, "Máximo 2000 caracteres."),
});

export type LeadInput = z.infer<typeof leadSchema>;
