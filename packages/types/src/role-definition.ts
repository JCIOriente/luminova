import type { Timestamp } from "firebase/firestore";
import type { Role } from "./permission-role.js";
import type { PermissionCode } from "./permission.js";

/** A role is data: an editable mapping of a display name to a coarse permission
 *  set. Built-ins are seeded and carry a `builtInKey` linking them to the
 *  hardcoded conditional logic (own-profile, scanner events, etc.). */
export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  builtInKey: Role | null;
  permissions: PermissionCode[];
  /** Admin role only — cannot be edited or deleted (prevents lockout). */
  locked: boolean;
  active: boolean;
  deletedAt: Timestamp | null;
}

/** Coarse, non-conditional perms each built-in role confers. Conditional grants
 *  (own-profile read/update, scanner event scope, attendance check-in scope)
 *  live in CASL + firestore.rules, NOT here — so Scanner/Member are empty.
 *
 *  Canonical SEED for the editable `roles/` docs (beacon seeds from this) AND the
 *  pre-backfill fallback in `buildAbility`. Once a built-in role doc is seeded it
 *  becomes the live source of truth (admins may edit non-locked ones); this
 *  constant is intentionally a snapshot. To change a built-in's defaults, edit
 *  here and re-seed. */
export const BUILT_IN_ROLE_PERMS: Record<Role, PermissionCode[]> = {
  Admin: ["manage:all"],
  Membership: [
    "manage:Member",
    "read:Ally",
    "create:Ally",
    "update:Ally",
    "read:MemberPoints",
    "read:Position",
  ],
  Treasury: ["read:Member", "read:MemberPoints"],
  ExecutiveCommittee: [
    "read:Member",
    "read:Ally",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
    "manage:Position",
  ],
  ProjectManager: [
    "manage:Project",
    "manage:Activity",
    "manage:Program",
    "read:Ally",
    "checkIn:Attendance",
  ],
  Scanner: [],
  Member: [],
};

/** Spanish display labels for the built-in roles — used when seeding the role docs
 *  (the `name` field). Custom roles carry their own admin-entered name. */
export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Administrador",
  Membership: "Membresía",
  Treasury: "Tesorería",
  ExecutiveCommittee: "Comité Ejecutivo",
  ProjectManager: "Director de Proyecto",
  Scanner: "Escáner",
  Member: "Miembro",
};
