import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { audienceSchema, type NotificationDoc } from "./notification.js";

const notificationStatsSchema = z.object({
  pushSent: z.number(),
  pushFailed: z.number(),
});

/** Read-schema for a composed `notifications/{id}` doc. The doc id is injected by
 *  `parseDocs`, so it is intentionally absent here (matches the other doc-schemas).
 *  `stats` is null until the beacon fan-out writes the delivery tally. */
export const notificationDocSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  audience: audienceSchema,
  createdBy: z.string(),
  createdAt: clientTimestampSchema,
  stats: notificationStatsSchema.nullable(),
}) satisfies z.ZodType<Omit<NotificationDoc, "id">>;
