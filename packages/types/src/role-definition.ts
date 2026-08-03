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

/** Coarse, non-conditional perms each built-in role confers. Object-scoped grants
 *  (own-profile read/update, attendance check-in scope) live in CASL + firestore.rules,
 *  NOT here.
 *
 *  Canonical SEED for the editable `roles/` docs (beacon seeds from this). Once a
 *  built-in role doc is seeded it becomes the live source of truth (admins may
 *  edit non-locked ones); this constant is intentionally a snapshot. To change a
 *  built-in's defaults, edit here and run the `reseedBuiltInRolePerms` callable —
 *  `seedRoles` uses create() and will NOT move an existing doc. */
export const BUILT_IN_ROLE_PERMS: Record<Role, PermissionCode[]> = {
  Admin: ["manage:all"],
  Membership: ["manage:Member", "read:MemberPoints", "read:Position"],
  Treasury: ["read:Member", "read:MemberPoints"],
  ExecutiveCommittee: [
    "read:Member",
    "read:Ally",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
    "read:Notification",
    "create:Notification",
    "read:Lead",
    "read:PointRule",
  ],
  ProjectManager: [
    "manage:Project",
    "manage:Program",
    "manage:Activity",
    "checkIn:Attendance",
    "read:Ally",
  ],
  // Meant for a JDL dirección — prod data created in /positions, never seeded onto a cargo.
  ActivityManager: ["manage:Activity", "checkIn:Attendance"],
  Secretary: ["manage:Notification", "manage:Lead", "manage:Ally"],
  // Coarse now, replacing the CASL eventId conditional. The Attendee-only restriction is a
  // Scanner-specific conjunct in firestore.rules, independent of where the perm came from.
  Scanner: ["read:Activity", "checkIn:Attendance"],
  // Member-facing read access: roster + leaderboard, own points, and the activities /
  // programs / projects catalogs. Read-only; every write stays gated. Deliberately NOT
  // read:PointRule — /point-rules gates on it with no role allowlist, so granting it would
  // put the admin page in every member's nav.
  Member: ["read:Member", "read:MemberPoints", "read:Activity", "read:Program", "read:Project"],
};

/** Spanish display labels for the built-in roles — used when seeding the role docs
 *  (the `name` field). Custom roles carry their own admin-entered name. */
export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Administrador",
  Membership: "Membresía",
  Treasury: "Tesorería",
  ExecutiveCommittee: "Comité Ejecutivo",
  ProjectManager: "Director de Proyecto",
  ActivityManager: "Actividades",
  Secretary: "Secretaría",
  Scanner: "Escáner",
  Member: "Miembro",
};

/** Spanish one-line descriptions for the built-in roles — seeded into the role doc's
 *  `description` field. Like ROLE_LABELS this is a SEED SNAPSHOT: once a doc exists the
 *  doc's own description is what every surface renders. Text carried verbatim from the
 *  former apps/backstage PERMISSION_ROLE_INFO map. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Admin: "Acceso total a la plataforma.",
  Membership: "Crear y editar miembros; ver puntos y cargos.",
  Treasury: "Gestionar pagos; ver miembros y puntos.",
  ExecutiveCommittee: "Ver la gestión del capítulo; enviar notificaciones.",
  ProjectManager: "Gestionar proyectos, programas y actividades; registrar asistencia.",
  ActivityManager: "Crear y editar actividades; registrar asistencia.",
  Secretary: "Comunicación del capítulo: notificaciones, prospectos y aliados.",
  Scanner: "Registrar asistencia en las actividades del capítulo.",
  Member: "Ver y editar su propio perfil; ver puntos y eventos.",
};
