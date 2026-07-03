import { z } from "zod";
import { timestampSchema } from "./timestamp-schema.js";
import type { MemberPoints } from "./member-points.js";

export const memberPointsDocSchema = z.object({
  memberId: z.string(),
  termId: z.string(),
  cumulative: z.number(),
  byMonth: z.record(z.string(), z.number()),
  updatedAt: timestampSchema,
}) satisfies z.ZodType<Omit<MemberPoints, "id">>;
