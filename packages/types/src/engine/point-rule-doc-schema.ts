import { z } from "zod";
import { POINT_RULE_CODES } from "./point-rule.js";
import type { PointRule } from "./point-rule.js";

export const pointRuleDocSchema = z.object({
  termId: z.string(),
  code: z.enum(POINT_RULE_CODES),
  points: z.number(),
  label: z.string(),
}) satisfies z.ZodType<Omit<PointRule, "id">>;
