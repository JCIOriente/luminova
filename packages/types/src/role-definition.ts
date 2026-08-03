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
 *  (own-profile read/update, scanner event scope, attendance check-in scope) live in
 *  CASL + firestore.rules, NOT here — so Scanner is empty. Member carries only the
 *  coarse reads that light up its member-facing nav pages (roster, leaderboard,
 *  activities, projects); its own-doc read/update stays object-scoped in CASL.
 *
 *  Canonical SEED for the editable `roles/` docs (beacon seeds from this). Once a
 *  built-in role doc is seeded it becomes the live source of truth (admins may
 *  edit non-locked ones); this constant is intentionally a snapshot. To change a
 *  built-in's defaults, edit here and re-seed. */
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
    "create:Notification",
    "read:Notification",
  ],
  ProjectManager: [
    "manage:Project",
    "manage:Activity",
    "manage:Program",
    "read:Ally",
    "checkIn:Attendance",
  ],
  Scanner: [],
  // Member-facing read access: roster + leaderboard (read:Member — the members
  // read rule keys on this capability), activities and projects catalogs
  // (read:Activity / read:Program — both collections are signed-in-readable, so
  // these only light up the backstage nav). Read-only; every write stays gated.
  Member: ["read:Member", "read:Activity", "read:Program"],
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

/** Spanish one-line descriptions for the built-in roles — seeded into the role doc's
 *  `description` field. Like ROLE_LABELS this is a SEED SNAPSHOT: once a doc exists the
 *  doc's own description is what every surface renders. Text carried verbatim from the
 *  former apps/backstage PERMISSION_ROLE_INFO map. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Admin: "Acceso total a la plataforma.",
  Membership: "Crear y editar miembros; ver aliados, eventos y puntos.",
  Treasury: "Gestionar pagos; ver miembros y puntos.",
  ExecutiveCommittee: "Ver gestión del capítulo; administrar cargos y comisiones.",
  ProjectManager: "Gestionar proyectos, programas y actividades; registrar asistencia.",
  Scanner: "Registrar asistencia en actividades asignadas.",
  Member: "Ver y editar su propio perfil; ver puntos y eventos.",
};
