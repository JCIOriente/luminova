import { z } from "zod";
import { LEAD_INTENTS } from "./lead.js";
import { boliviaPhoneOptional } from "./phone.js";

export const LEAD_NAME_MAX_LENGTH = 100;
export const LEAD_EMAIL_MAX_LENGTH = 200;
export const LEAD_MESSAGE_MAX_LENGTH = 2000;

/** Public contact-form input. The write path adds status/source/createdAt/deletedAt. */
export const leadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresa tu nombre.")
    .max(LEAD_NAME_MAX_LENGTH, `Máximo ${LEAD_NAME_MAX_LENGTH} caracteres.`),
  email: z
    .string()
    .trim()
    .min(1, "Ingresa tu email.")
    .max(LEAD_EMAIL_MAX_LENGTH, `Máximo ${LEAD_EMAIL_MAX_LENGTH} caracteres.`)
    .email("Email no válido."),
  phone: boliviaPhoneOptional,
  intent: z.enum(LEAD_INTENTS),
  message: z
    .string()
    .trim()
    .min(1, "Cuéntanos qué te trae por aquí.")
    .max(LEAD_MESSAGE_MAX_LENGTH, `Máximo ${LEAD_MESSAGE_MAX_LENGTH} caracteres.`),
});

export type LeadInput = z.infer<typeof leadSchema>;
