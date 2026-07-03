import { z } from "zod";
import { timestampSchema } from "./timestamp-schema.js";
import { photoDocSchema } from "./initiative-doc-schema.js";
import { ACTIVITY_CATEGORIES, ACTIVITY_STATUSES, INITIATIVE_KINDS } from "./activity.js";
import type { Activity } from "./activity.js";

export const activityDocSchema = z.object({
  termId: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  category: z.enum(ACTIVITY_CATEGORIES),
  parentType: z.enum(INITIATIVE_KINDS).nullable(),
  parentId: z.string().nullable(),
  organizers: z.object({
    directorId: z.string().nullable(),
    coDirectorIds: z.array(z.string()),
  }),
  startAt: timestampSchema,
  endAt: timestampSchema.nullable(),
  photos: z.array(photoDocSchema).default([]),
  status: z.enum(ACTIVITY_STATUSES),
  hasCheckIns: z.boolean().optional(),
}) satisfies z.ZodType<Omit<Activity, "id">>;
