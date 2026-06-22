import { ACTIONS, SUBJECTS, type Action, type Subject, type PermissionCode } from "@luminova/types";

/** Subjects offered in the assignable matrix. Excludes the meta subjects:
 *  - "all": `manage:all` is the Admin superuser grant, never assignable to a custom role.
 *  - "Role": role management stays Admin-only (rules gate roles/ on manage:all). */
export const MATRIX_SUBJECTS = SUBJECTS.filter(
  (s): s is Exclude<Subject, "all" | "Role"> => s !== "all" && s !== "Role",
);

export const MATRIX_ACTIONS: readonly Action[] = ACTIONS;

export function permissionCode(action: Action, subject: Subject): PermissionCode {
  return `${action}:${subject}` as PermissionCode;
}

export const ACTION_LABELS: Record<Action, string> = {
  manage: "Gestionar",
  create: "Crear",
  read: "Ver",
  update: "Editar",
  delete: "Eliminar",
  checkIn: "Registrar",
};

export const SUBJECT_LABELS: Record<Exclude<Subject, "all" | "Role">, string> = {
  Member: "Miembros",
  Ally: "Aliados",
  Event: "Eventos",
  PointRule: "Reglas de puntos",
  MemberPoints: "Puntos",
  Payment: "Pagos",
  Attendance: "Asistencia",
  Program: "Programas",
  Project: "Proyectos",
  Activity: "Actividades",
  Position: "Cargos",
};

/** Human label for a single code, e.g. "Editar Miembros". */
export function permissionLabel(code: PermissionCode): string {
  const [action, subject] = code.split(":") as [Action, string];
  const subjectLabel = (SUBJECT_LABELS as Record<string, string>)[subject] ?? subject;
  return `${ACTION_LABELS[action]} ${subjectLabel}`;
}
