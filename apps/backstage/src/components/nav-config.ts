import { Icon } from "@luminova/ui";
import { hasAnyRole, type Role } from "@luminova/auth/roles";
import type { AppAbility } from "@luminova/auth/ability";

type IconKey = keyof typeof Icon;

type Subject =
  | "Member"
  | "Ally"
  | "PointRule"
  | "Activity"
  | "Attendance"
  | "Program"
  | "Project"
  | "Position";

export interface NavItem {
  to:
    | "/"
    | "/me"
    | "/members"
    | "/allies"
    | "/point-rules"
    | "/leaderboard"
    | "/activities"
    | "/initiatives"
    | "/positions"
    | "/permisos";
  label: string;
  icon: IconKey;
  exact?: boolean;
  subject?: Subject;
  anySubject?: Subject[];
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
      {
        to: "/positions",
        label: "Cargos y comisiones",
        icon: "compass",
        subject: "Position",
        // Members can read Position (chip resolution on /me) — keep the catalog page off their nav.
        roles: ["Admin", "Membership", "ExecutiveCommittee"],
      },
      { to: "/permisos", label: "Permisos", icon: "lock", roles: ["Admin"] },
    ],
  },
  {
    label: "Reconocimiento",
    items: [
      { to: "/activities", label: "Actividades", icon: "calendar", subject: "Activity" },
      {
        to: "/initiatives",
        label: "Proyectos",
        icon: "briefcase",
        anySubject: ["Program", "Project"],
      },
    ],
  },
];

export function isNavItemVisible(
  item: NavItem,
  ability: AppAbility,
  claims: Parameters<typeof hasAnyRole>[0],
): boolean {
  return (
    (!item.subject || ability.can(item.action ?? "read", item.subject)) &&
    (!item.anySubject || item.anySubject.some((s) => ability.can(item.action ?? "read", s))) &&
    (!item.roles || hasAnyRole(claims, item.roles))
  );
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
  );
}
