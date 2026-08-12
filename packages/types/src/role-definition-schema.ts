import { z } from "zod";
import { ALL_PERMISSION_CODES, PERMISSION_CAP, type PermissionCode } from "./permission.js";

/** Shared permission-code schema (DRY across role + member assignment forms).
 *  Cast preserves the `PermissionCode` output type through `.parse()`. */
export const permissionCodeSchema = z.enum(
  ALL_PERMISSION_CODES as [PermissionCode, ...PermissionCode[]],
);

/** Max role display name length. firestore.rules' roleShapeValid() hand-writes the SAME
 *  number (`d.name.size() <= 100`) and cannot import it, so the two must move together —
 *  `role-name-bound.rules.test.ts` parses the rules and fails if they drift. Mirrored here
 *  rather than left to the rules alone because a rules-only bound surfaces as a generic
 *  "No se pudo guardar", and a doc already over it (built-in renaming shipped with no upper
 *  bound) has EVERY client update denied — permissions and deactivation included. */
export const ROLE_NAME_MAX_LENGTH = 100;

export const roleDefinitionSchema = z.object({
  name: z
    .string()
    .min(1, "Requerido.")
    .max(ROLE_NAME_MAX_LENGTH, `Máximo ${ROLE_NAME_MAX_LENGTH} caracteres.`),
  description: z.string(),
  permissions: z
    .array(permissionCodeSchema)
    .max(PERMISSION_CAP, `Máximo ${PERMISSION_CAP} permisos.`)
    .refine((codes) => new Set(codes).size === codes.length, "Permisos duplicados."),
});

export type RoleDefinitionInput = z.infer<typeof roleDefinitionSchema>;
