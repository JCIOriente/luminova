import type { Role } from "@luminova/types";

export const PERMISSION_ROLE_INFO: Record<Role, { label: string; description: string }> = {
  Admin: { label: "Administración", description: "Acceso total a la plataforma." },
  Membership: {
    label: "Membresía",
    description: "Crear y editar miembros; ver aliados, eventos y puntos.",
  },
  Treasury: { label: "Tesorería", description: "Gestionar pagos; ver miembros y puntos." },
  ExecutiveCommittee: {
    label: "Comité ejecutivo",
    description: "Ver gestión del capítulo; administrar cargos y comisiones.",
  },
  ProjectManager: {
    label: "Proyectos",
    description: "Gestionar proyectos, programas y actividades; registrar asistencia.",
  },
  Scanner: { label: "Escáner", description: "Registrar asistencia en actividades asignadas." },
  Member: {
    label: "Miembro",
    description: "Ver y editar su propio perfil; ver puntos y eventos.",
  },
};
