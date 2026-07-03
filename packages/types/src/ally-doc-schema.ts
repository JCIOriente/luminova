import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import type { Ally } from "./ally.js";
import { ALLY_CATEGORIES } from "./engine/ally-public.js";

export const allyDocSchema = z.object({
  companyName: z.string(),
  contactPerson: z.string(),
  phone: z.string(),
  email: z.string(),
  logoUrl: z.string().nullable().default(null),
  category: z.enum(ALLY_CATEGORIES).nullable().default(null),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<Ally, "id">>;
