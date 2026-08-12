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
  //
  // `z.unknown()` and not `z.string()`, extending that same read-tolerance one element
  // type further, because the two readers of this doc must compute the SAME set.
  // firestore.rules can only assert `permissions is list` — it has no element-wise
  // quantifier — so `{permissions: ['manage:all', 0]}` is an ALLOWED write. Under
  // z.array(z.string()) one non-string element failed the whole doc: parseDocs dropped it
  // with just a console.error, /permisos re-rendered the role through its "unsynced"
  // branch (showing the SEED perms, offering no editor to repair it) while beacon's
  // permsFromRoleDoc FILTERS rather than rejects and went on minting `manage:all` — for
  // roles/Member, i.e. every provisioned user. Filtering here mirrors permsFromRoleDoc
  // exactly, so both readers agree and the doc stays visible and editable in-app.
  // A `permissions` that is not a list at all still rejects: that one rules CAN check.
  permissions: z.array(z.unknown()).transform((codes) => codes.filter(isValidPermissionCode)),
  locked: z.boolean(),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<RoleDefinition, "id">>;
