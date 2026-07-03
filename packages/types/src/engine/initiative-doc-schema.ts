import { z } from "zod";
import { timestampSchema } from "./timestamp-schema.js";
import { AREAS_OF_OPPORTUNITY, INITIATIVE_STATUSES } from "./initiative.js";
import type { InitiativeCore, Photo } from "./initiative.js";

export const photoDocSchema = z.object({
  id: z.string(),
  url: z.string(),
  caption: z.string().nullable(),
  uploadedAt: timestampSchema,
  uploadedBy: z.string(),
}) satisfies z.ZodType<Photo>;

export const initiativeDocSchema = z.object({
  termId: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(AREAS_OF_OPPORTUNITY),
  startDate: timestampSchema,
  endDate: timestampSchema,
  roster: z.object({
    directorId: z.string(),
    coDirectorIds: z.array(z.string()),
    teamIds: z.array(z.string()),
  }),
  photos: z.array(photoDocSchema).default([]),
  impact: z
    .object({
      personsImpacted: z.number(),
      volunteers: z.number(),
      custom: z.array(z.object({ label: z.string(), value: z.string() })),
      closingSummary: z.string(),
    })
    .nullable()
    .default(null),
  finalReport: z.object({ filedAt: timestampSchema, filedBy: z.string() }).nullable().default(null),
  status: z.enum(INITIATIVE_STATUSES),
  directionUids: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
}) satisfies z.ZodType<Omit<InitiativeCore, "id">>;
