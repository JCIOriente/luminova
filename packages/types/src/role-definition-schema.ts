import { z } from "zod";
import { ALL_PERMISSION_CODES, PERMISSION_CAP, type PermissionCode } from "./permission.js";

/** Shared permission-code schema (DRY across role + member assignment forms).
 *  Cast preserves the `PermissionCode` output type through `.parse()`. */
export const permissionCodeSchema = z.enum(
  ALL_PERMISSION_CODES as [PermissionCode, ...PermissionCode[]],
);

export const roleDefinitionSchema = z.object({
  name: z.string().min(1, "Requerido."),
  description: z.string(),
  permissions: z
    .array(permissionCodeSchema)
    .max(PERMISSION_CAP, `Máximo ${PERMISSION_CAP} permisos.`)
    .refine((codes) => new Set(codes).size === codes.length, "Permisos duplicados."),
});

export type RoleDefinitionInput = z.infer<typeof roleDefinitionSchema>;
