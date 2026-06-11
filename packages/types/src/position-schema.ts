import { z } from "zod";
import { POSITION_CATEGORIES } from "./position.js";
import { ROLES } from "./permission-role.js";

const optionalText = (min: number, msg: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.string().min(min, msg).optional());

export const positionSchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    titleFemale: optionalText(3, "Mínimo 3 caracteres."),
    sigla: optionalText(1, "Requerido."),
    category: z.enum(POSITION_CATEGORIES),
    grants: z.array(z.enum(ROLES)),
    term: z
      .number({ error: "Requerido." })
      .int()
      .min(2000, "Año inválido.")
      .max(2100, "Año inválido.")
      .nullable(),
    description: z.string().min(1, "Requerido."),
  })
  .refine((p) => (p.category === "JDL") === (p.term !== null), {
    message: "Solo las direcciones JDL llevan gestión.",
    path: ["term"],
  })
  .superRefine((p, ctx) => {
    if (p.category === "Comision") {
      if (!p.sigla)
        ctx.addIssue({ code: "custom", path: ["sigla"], message: "Requerido para comisiones." });
      if (p.grants.length > 0)
        ctx.addIssue({
          code: "custom",
          path: ["grants"],
          message: "Las comisiones no otorgan permisos.",
        });
      if (p.titleFemale)
        ctx.addIssue({
          code: "custom",
          path: ["titleFemale"],
          message: "Las comisiones no llevan variante femenina.",
        });
    } else if (p.sigla) {
      ctx.addIssue({
        code: "custom",
        path: ["sigla"],
        message: "Solo las comisiones llevan sigla.",
      });
    }
  });

export type PositionInput = z.infer<typeof positionSchema>;
