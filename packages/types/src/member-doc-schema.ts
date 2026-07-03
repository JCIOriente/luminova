import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { MEMBER_STATUSES, MEMBER_GENDERS } from "./member.js";
import type { Member } from "./member.js";
import { termPositionsDocSchema } from "./position-doc-schema.js";
import { permissionCodeSchema } from "./role-definition-schema.js";

export const memberDocSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  profession: z.string().optional(),
  joinDate: clientTimestampSchema,
  birthdate: clientTimestampSchema,
  status: z.enum(MEMBER_STATUSES),
  profilePicture: z.string().nullable().default(null),
  totalPoints: z.number().default(0),
  isPastPresident: z.boolean().optional(),
  gender: z.enum(MEMBER_GENDERS).optional(),
  positions: z.record(z.string(), termPositionsDocSchema).optional(),
  uid: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
  permissionOverrides: z
    .object({
      grant: z.array(permissionCodeSchema),
      revoke: z.array(permissionCodeSchema),
    })
    .optional(),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<Member, "id">>;
