import { z } from "zod";
import { POSITION_CATEGORIES } from "./position.js";
import { ROLES } from "./permission-role.js";

export const positionSchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    titleFemale: z.string().min(3, "Mínimo 3 caracteres."),
    category: z.enum(POSITION_CATEGORIES),
    grants: z.array(z.enum(ROLES)),
    term: z.number({ error: "Requerido." }).int().min(2000, "Año inválido.").max(2100, "Año inválido.").nullable(),
    description: z.string().min(1, "Requerido."),
  })
  .refine((p) => (p.category === "JDL") === (p.term !== null), {
    message: "Solo las direcciones JDL llevan gestión.",
    path: ["term"],
  });

export type PositionInput = z.infer<typeof positionSchema>;
