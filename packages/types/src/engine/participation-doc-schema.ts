import { z } from "zod";
import { timestampSchema } from "./timestamp-schema.js";
import { PARTICIPATION_ROLES, PARTICIPATION_STATES } from "./participation.js";
import type { Participation } from "./participation.js";
import { POINT_RULE_CODES } from "./point-rule.js";
import { INITIATIVE_KINDS } from "./activity.js";

export const participationDocSchema = z.object({
  memberId: z.string(),
  termId: z.string(),
  activityId: z.string(),
  parentType: z.enum(INITIATIVE_KINDS).nullable(),
  parentId: z.string().nullable(),
  role: z.enum(PARTICIPATION_ROLES),
  pointRuleCode: z.enum(POINT_RULE_CODES),
  basePoints: z.number(),
  punctualityFactor: z.union([z.literal(1), z.literal(0.5)]),
  computedPoints: z.number(),
  monthBucket: z.string(),
  state: z.enum(PARTICIPATION_STATES),
  gates: z.object({
    attendanceRegistered: z.boolean(),
    finalReportFiled: z.boolean(),
  }),
  checkInAt: timestampSchema.nullable(),
  voidReason: z.string().nullable(),
  createdAt: timestampSchema,
}) satisfies z.ZodType<Omit<Participation, "id">>;
