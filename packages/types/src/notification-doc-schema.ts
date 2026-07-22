import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { audienceSchema, type NotificationDoc, type InboxDoc } from "./notification.js";

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

/** Read-schema for a member's inbox copy at `members/{uid}/notifications/{id}`.
 *  The doc id is injected by `parseDocs`, so it is intentionally absent here
 *  (matches the other doc-schemas). Owner-scoped: no CASL subject — every member
 *  reads their own inbox and may flip only `read` (see `INBOX_MUTABLE_FIELDS`). */
export const inboxDocSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  read: z.boolean(),
  createdAt: clientTimestampSchema,
}) satisfies z.ZodType<Omit<InboxDoc, "id">>;
