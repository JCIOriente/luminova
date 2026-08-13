import { z } from "zod";
import { ALL_PERMISSION_CODES, PERMISSION_CAP, type PermissionCode } from "./permission.js";

/** Shared permission-code schema (DRY across role + member assignment forms).
 *  Cast preserves the `PermissionCode` output type through `.parse()`. */
export const permissionCodeSchema = z.enum(
  ALL_PERMISSION_CODES as [PermissionCode, ...PermissionCode[]],
);

/** Max role display name length. firestore.rules' roleShapeValid() hand-writes the SAME
 *  number (`d.name.size() <= 100`) and cannot import it, so the two must move together —
 *  `role-name-bound.rules.test.ts` parses the rules and fails if they drift.
 *
 *  Mirrored here rather than left to the rules alone because the rules-only lockout is a
 *  WORSE class than the legacy-doc lockout the rules comment accepts. A doc missing
 *  `active`/`description`/`locked` is rejected by roleDefinitionDocSchema, so it never
 *  rendered a row and no working affordance is lost. A >100-char name PASSES the doc schema
 *  and renders a full row — "Editar", "Desactivar rol", "Reactivar rol" — and every one of
 *  those 403s, because `request.resource.data` on an update is the MERGED doc, so the long
 *  name is re-validated even by a write that only touches `active`/`deletedAt`. The only
 *  escape is shortening the name, which this bound now makes a form error rather than a
 *  generic "No se pudo guardar".
 *
 *  On the two length functions agreeing — MEASURED against the rules emulator, not reasoned.
 *  An earlier draft of this comment asserted `String.size()` counts Unicode code points and
 *  concluded this bound was merely "never looser". That premise was wrong. Three probes:
 *  100 astral emoji (100 code points / 200 UTF-16 units) is DENIED by the rule; 100 `é`
 *  (100 UTF-16 units / 200 UTF-8 bytes) is ALLOWED; 100 ASCII is allowed. So `size()` counts
 *  UTF-16 code units — exactly what `.length` counts, and not bytes. The mirror is EXACT in
 *  both directions: this schema accepts a name iff the rule does, so there is no false 403
 *  the form fails to pre-empt, and no false client rejection either. */
export const ROLE_NAME_MAX_LENGTH = 100;

export const roleDefinitionSchema = z.object({
  // `.trim()` before the bounds, and CLIENT-ONLY — not a mirror of anything. Rules cannot
  // trim, so `size() >= 1` accepts "   " and so did a bare `.min(1)`; `roleDisplay` then
  // treats that whitespace as truthy and renders a built-in with a blank label. Trimming on
  // the write path stops new ones; roleDisplay trims defensively for the ones a console can
  // still author.
  name: z
    .string()
    .trim()
    .min(1, "Requerido.")
    .max(ROLE_NAME_MAX_LENGTH, `Máximo ${ROLE_NAME_MAX_LENGTH} caracteres.`),
  description: z.string(),
  permissions: z
    .array(permissionCodeSchema)
    .max(PERMISSION_CAP, `Máximo ${PERMISSION_CAP} permisos.`)
    .refine((codes) => new Set(codes).size === codes.length, "Permisos duplicados."),
});

export type RoleDefinitionInput = z.infer<typeof roleDefinitionSchema>;
