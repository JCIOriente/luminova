import type { Firestore } from "firebase-admin/firestore";
import { ROLES, type Role } from "@luminova/auth/roles";
import {
  BUILT_IN_ROLE_PERMS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@luminova/types/role-definition";
import type { PermissionCode } from "@luminova/types/permission";

export interface SeedRoleDoc {
  id: string;
  name: string;
  description: string;
  builtIn: true;
  builtInKey: Role;
  permissions: PermissionCode[];
  locked: boolean;
  active: true;
  deletedAt: null;
}

/** The 7 built-in role docs to seed (id = role name). Admin is locked. */
export function buildBuiltInRoleDocs(): SeedRoleDoc[] {
  return ROLES.map((role) => ({
    id: role,
    name: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
    builtIn: true,
    builtInKey: role,
    permissions: BUILT_IN_ROLE_PERMS[role],
    locked: role === "Admin",
    active: true,
    deletedAt: null,
  }));
}

/** Seed built-in role docs idempotently — never clobbers an existing doc, so an
 *  admin's edits to a built-in role's perms survive re-runs. Uses create() (atomic
 *  fail-if-exists) so two concurrent seed calls can't race a read-then-write into a
 *  clobber. Returns ids created. */
export async function seedBuiltInRoles(db: Firestore): Promise<string[]> {
  const created: string[] = [];
  for (const doc of buildBuiltInRoleDocs()) {
    const { id, ...data } = doc;
    try {
      await db.doc(`roles/${id}`).create(data);
      created.push(id);
    } catch (error) {
      if ((error as { code?: number }).code !== 6) throw error; // 6 = ALREADY_EXISTS
    }
  }
  return created;
}
