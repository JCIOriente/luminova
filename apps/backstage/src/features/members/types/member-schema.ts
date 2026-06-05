import { z } from "zod";

export const MEMBER_STATUSES = ["Activo", "Inactivo", "Desafiliado"] as const;

const dateString = z
  .string()
  .min(1, "Requerido.")
  .refine((value) => {
    // Parse as UTC midnight and reject overflow dates (e.g. 2024-02-30 → 03-01).
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Fecha inválida.");

export const memberSchema = z.object({
  name: z.string().min(3, "Mínimo 3 caracteres."),
  email: z.string().email("Correo inválido."),
  phone: z.string().optional(),
  role: z.string().min(3, "Mínimo 3 caracteres."),
  profession: z.string().optional(),
  joinDate: dateString,
  birthdate: dateString,
  status: z.enum(MEMBER_STATUSES),
});

export type MemberInput = z.infer<typeof memberSchema>;
