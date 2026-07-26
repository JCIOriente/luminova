import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import type { RoleDefinition } from "./role-definition.js";
import { ROLES } from "./permission-role.js";
import { isValidPermissionCode } from "./permission.js";

export const roleDefinitionDocSchema = z.object({
  name: z.string(),
  description: z.string(),
  builtIn: z.boolean(),
  builtInKey: z.enum(ROLES).nullable(),
  // Tolerant on READ: a role doc seeded before a Subject was dropped (e.g. the
  // removed `Event` subject, migration PR-D) still lists that now-unknown code.
  // A strict enum would reject the whole array, and one dead code would blank the
  // entire roles UI + the notification audience picker. Instead drop unknown codes
  // and keep the valid ones — an unrecognized code grants nothing anyway (CASL and
  // firestore.rules don't know it). The WRITE path (roleDefinitionSchema) stays a
  // strict enum, so no new invalid code can be authored.
  permissions: z.array(z.string()).transform((codes) => codes.filter(isValidPermissionCode)),
  locked: z.boolean(),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<RoleDefinition, "id">>;
