import { z } from "zod";
import { POINT_RULE_CODES } from "./point-rule.js";

export const pointRuleSchema = z.object({
  code: z.enum(POINT_RULE_CODES),
  points: z.number().int("Debe ser un entero.").min(0, "No puede ser negativo."),
  label: z.string().min(1, "Requerido."),
});

export type PointRuleInput = z.infer<typeof pointRuleSchema>;
