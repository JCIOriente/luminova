import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import type { RoleDefinition } from "./role-definition.js";
import { ROLES } from "./permission-role.js";
import { permissionCodeSchema } from "./role-definition-schema.js";

export const roleDefinitionDocSchema = z.object({
  name: z.string(),
  description: z.string(),
  builtIn: z.boolean(),
  builtInKey: z.enum(ROLES).nullable(),
  permissions: z.array(permissionCodeSchema),
  locked: z.boolean(),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<RoleDefinition, "id">>;
