import { z } from "zod";
import type { Timestamp } from "firebase/firestore";

export const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("everyone") }),
  z.object({ type: z.literal("members") }),
  z.object({ type: z.literal("role"), roleId: z.string().min(1) }),
]);
export type Audience = z.infer<typeof audienceSchema>;

export const NOTIFICATION_TITLE_MAX_LENGTH = 120;
export const NOTIFICATION_BODY_MAX_LENGTH = 1000;
export const NOTIFICATION_URL_MAX_LENGTH = 2000;

export const notificationCreateSchema = z.object({
  title: z
    .string()
    .min(1, "Requerido.")
    .max(NOTIFICATION_TITLE_MAX_LENGTH, `Máximo ${NOTIFICATION_TITLE_MAX_LENGTH} caracteres.`),
  body: z
    .string()
    .min(1, "Requerido.")
    .max(NOTIFICATION_BODY_MAX_LENGTH, `Máximo ${NOTIFICATION_BODY_MAX_LENGTH} caracteres.`),
  url: z
    .string()
    .url("Ingresa un enlace válido.")
    .max(NOTIFICATION_URL_MAX_LENGTH, `Máximo ${NOTIFICATION_URL_MAX_LENGTH} caracteres.`)
    .nullable(),
  audience: audienceSchema,
});
export type NotificationCreate = z.infer<typeof notificationCreateSchema>;

export interface NotificationStats {
  pushSent: number;
  pushFailed: number;
}

export interface NotificationDoc extends NotificationCreate {
  id: string;
  createdBy: string;
  createdAt: Timestamp;
  stats: NotificationStats | null;
}

export interface InboxDoc {
  id: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: Timestamp;
}

/** The only field a member may mutate on their own inbox copy. Mirrored in
 *  firestore.rules; a rules test cross-checks the two stay in lockstep. */
export const INBOX_MUTABLE_FIELDS = ["read"] as const;
