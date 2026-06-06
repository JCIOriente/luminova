import { z } from "zod";
import { ACTIVITY_CATEGORIES } from "./activity.js";

export const activitySchema = z
  .object({
    category: z.enum(ACTIVITY_CATEGORIES),
    parentType: z.enum(["Program", "Project"]).nullable(),
    parentId: z.string().min(1).nullable(),
    startAt: z.string().min(1, "Requerido."),
    directorId: z.string().min(1).nullable(),
    coDirectorId: z.string().min(1).nullable(),
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
  });

export type ActivityInput = z.infer<typeof activitySchema>;
