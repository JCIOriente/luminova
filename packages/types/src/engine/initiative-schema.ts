import { z } from "zod";
import { INITIATIVE_STATUSES } from "./initiative.js";

export const initiativeRosterSchema = z
  .object({
    directorId: z.string().min(1, "Requerido."),
    coDirectorId: z.string().min(1).nullable(),
    teamIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((r, ctx) => {
    if (r.coDirectorId !== null && r.coDirectorId === r.directorId) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede ser el director.",
        path: ["coDirectorId"],
      });
    }
    if (r.teamIds.includes(r.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El director no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
    if (r.coDirectorId !== null && r.teamIds.includes(r.coDirectorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
  });
export type InitiativeRosterInput = z.infer<typeof initiativeRosterSchema>;

export const initiativeFormSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres."),
  roster: initiativeRosterSchema,
  status: z.enum(INITIATIVE_STATUSES),
});
export type InitiativeInput = z.infer<typeof initiativeFormSchema>;
