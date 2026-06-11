import { z } from "zod";
import { AREAS_OF_OPPORTUNITY, INITIATIVE_STATUSES } from "./initiative.js";

export const initiativeRosterSchema = z
  .object({
    directorId: z.string().min(1, "Requerido."),
    coDirectorIds: z.array(z.string().min(1)),
    teamIds: z.array(z.string().min(1)),
  })
  .superRefine((r, ctx) => {
    if (r.coDirectorIds.includes(r.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede ser el director.",
        path: ["coDirectorIds"],
      });
    }
    if (new Set(r.coDirectorIds).size !== r.coDirectorIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Codirectores duplicados.",
        path: ["coDirectorIds"],
      });
    }
    if (r.teamIds.includes(r.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El director no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
    if (r.coDirectorIds.some((id) => r.teamIds.includes(id))) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
  });
export type InitiativeRosterInput = z.infer<typeof initiativeRosterSchema>;

export const initiativeFormSchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    description: z.string().min(10, "Mínimo 10 caracteres."),
    category: z.enum(AREAS_OF_OPPORTUNITY),
    startDate: z.string().min(1, "Requerido."),
    endDate: z.string().min(1, "Requerido."),
    roster: initiativeRosterSchema,
    status: z.enum(INITIATIVE_STATUSES),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "El cierre no puede ser antes del inicio.",
        path: ["endDate"],
      });
    }
  });
export type InitiativeInput = z.infer<typeof initiativeFormSchema>;

export const impactMetricSchema = z.object({
  label: z.string().min(1, "Requerido."),
  value: z.string().min(1, "Requerido."),
});

export const initiativeImpactSchema = z.object({
  personsImpacted: z.number().int().min(0, "Debe ser 0 o más."),
  volunteers: z.number().int().min(0, "Debe ser 0 o más."),
  custom: z.array(impactMetricSchema),
  closingSummary: z.string().min(10, "Mínimo 10 caracteres."),
});
export type InitiativeImpactInput = z.infer<typeof initiativeImpactSchema>;
