import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { LEAD_INTENTS, LEAD_STATUSES, type Lead } from "./lead.js";

export const leadDocSchema = z.object({
  name: z.string(),
  email: z.string(),
  intent: z.enum(LEAD_INTENTS),
  message: z.string(),
  status: z.enum(LEAD_STATUSES),
  source: z.string(),
  createdAt: clientTimestampSchema,
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<Lead, "id">>;
