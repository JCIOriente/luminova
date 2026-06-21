import { z } from "zod";
import { ALL_PERMISSION_CODES, PERMISSION_CAP } from "./permission.js";

/** Shared permission-code schema (DRY across role + member assignment forms). */
export const permissionCodeSchema = z.enum(
  ALL_PERMISSION_CODES as [string, ...string[]],
);

export const roleDefinitionSchema = z.object({
  name: z.string().min(1, "Requerido."),
  description: z.string(),
  permissions: z
    .array(permissionCodeSchema)
    .max(PERMISSION_CAP, `Máximo ${PERMISSION_CAP} permisos.`),
});

export type RoleDefinitionInput = z.infer<typeof roleDefinitionSchema>;
