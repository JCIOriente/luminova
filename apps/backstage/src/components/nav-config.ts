import { Icon } from "@luminova/ui";
import type { Role } from "@luminova/auth/roles";

type IconKey = keyof typeof Icon;

export interface NavItem {
  to:
    | "/"
    | "/me"
    | "/members"
    | "/allies"
    | "/point-rules"
    | "/leaderboard"
    | "/activities"
    | "/programs"
    | "/projects"
    | "/check-in"
    | "/positions";
  label: string;
  icon: IconKey;
  exact?: boolean;
  subject?:
    | "Member"
    | "Ally"
    | "PointRule"
    | "Activity"
    | "Attendance"
    | "Program"
    | "Project"
    | "Position";
  action?: "read" | "checkIn";
  /** Optional role allowlist — item shows only if the caller has one of these. */
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Panel",
    items: [
      { to: "/", label: "Inicio", icon: "home", exact: true },
      { to: "/me", label: "Mi panel", icon: "user" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/members", label: "Miembros", icon: "user", subject: "Member" },
      { to: "/allies", label: "Aliados", icon: "handshake", subject: "Ally" },
      { to: "/point-rules", label: "Reglas de puntos", icon: "target", subject: "PointRule" },
      {
        to: "/leaderboard",
        label: "Clasificación",
        icon: "barChart",
        roles: ["Admin", "Membership", "Treasury", "ExecutiveCommittee", "ProjectManager"],
      },
      { to: "/positions", label: "Cargos y comisiones", icon: "compass", subject: "Position" },
    ],
  },
  {
    label: "Reconocimiento",
    items: [
      { to: "/activities", label: "Actividades", icon: "calendar", subject: "Activity" },
      { to: "/programs", label: "Programas", icon: "folder", subject: "Program" },
      { to: "/projects", label: "Proyectos", icon: "briefcase", subject: "Project" },
      {
        to: "/check-in",
        label: "Check-in",
        icon: "qr",
        subject: "Attendance",
        action: "checkIn",
      },
    ],
  },
];

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
  );
}
