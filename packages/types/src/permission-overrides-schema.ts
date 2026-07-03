import { z } from "zod";
import { permissionCodeSchema } from "./role-definition-schema.js";
import type { PermissionOverrides } from "./permission-overrides.js";

export const permissionOverridesSchema = z.object({
  grant: z.array(permissionCodeSchema),
  revoke: z.array(permissionCodeSchema),
}) satisfies z.ZodType<PermissionOverrides>;
