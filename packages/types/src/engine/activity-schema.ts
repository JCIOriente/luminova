import { z } from "zod";
import { ACTIVITY_CATEGORIES } from "./activity.js";

export const activitySchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    description: z.string(),
    location: z.string().max(300, "Máximo 300 caracteres."),
    category: z.enum(ACTIVITY_CATEGORIES),
    parentType: z.enum(["Program", "Project"]).nullable(),
    parentId: z.string().min(1).nullable(),
    startAt: z.string().min(1, "Requerido."),
    endAt: z.string().min(1).nullable(),
    directorId: z.string().min(1).nullable(),
    coDirectorIds: z.array(z.string().min(1)),
  })
  .superRefine((value, ctx) => {
    const isExecution = value.category === "ProjectExecution";
    const hasParent = value.parentType !== null && value.parentId !== null;
    if (isExecution && !hasParent) {
      ctx.addIssue({
        code: "custom",
        message: "Una ejecución requiere un programa o proyecto padre.",
        path: ["parentId"],
      });
    }
    if (!isExecution && hasParent) {
      ctx.addIssue({
        code: "custom",
        message: "Una actividad institucional no lleva padre.",
        path: ["parentId"],
      });
    }
    if (value.endAt !== null && value.endAt < value.startAt) {
      ctx.addIssue({
        code: "custom",
        message: "El fin no puede ser antes del inicio.",
        path: ["endAt"],
      });
    }
    if (value.directorId !== null && value.coDirectorIds.includes(value.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede ser el director.",
        path: ["coDirectorIds"],
      });
    }
  });

export type ActivityInput = z.infer<typeof activitySchema>;
