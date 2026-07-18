import { Icon } from "@luminova/ui";
import { hasAnyRole, type Role, type AuthClaims } from "@luminova/auth/roles";
import { buildAbility, subject, type AppAbility } from "@luminova/auth/ability";

type IconKey = keyof typeof Icon;

type Subject =
  | "Member"
  | "Ally"
  | "PointRule"
  | "Activity"
  | "Attendance"
  | "Program"
  | "Project"
  | "Position"
  | "Lead";

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
    | "/permisos"
    | "/leads"
    | "/config";
  label: string;
  icon: IconKey;
  exact?: boolean;
  subject?: Subject;
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
      { to: "/leads", label: "Prospectos", icon: "mail", subject: "Lead" },
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
        // Program read = the management tier (Admin/ExecutiveCommittee/ProjectManager).
        // Gate on Program, NOT Project: a plain Member carries an unconditional
        // `read:Project` (for /me's participation names), which an OR-of-both gate
        // would leak into this admin catalog. No role reads Project without also
        // reading Program, so Program alone is the correct management signal.
        subject: "Program",
      },
    ],
  },
  {
    label: "Sitio",
    items: [{ to: "/config", label: "Configuración", icon: "settings", roles: ["Admin"] }],
  },
];

export function isNavItemVisible(item: NavItem, ability: AppAbility, claims: AuthClaims): boolean {
  return (
    // Probe an EMPTY subject instance, not the bare subject type. A conditional
    // grant — e.g. a Member's own-doc `can('read','Member',{uid})` — must NOT
    // satisfy a collection-level nav gate: CASL's type-level `can('read','Member')`
    // returns true whenever ANY conditional grant exists, which showed a plain
    // Member the admin Miembros nav + route, then died on the unconditional list
    // query that firestore.rules (correctly) denies. An empty instance matches
    // only UNCONDITIONAL grants — mirroring what the rules actually allow for a list.
    (!item.subject || ability.can(item.action ?? "read", subject(item.subject, {}))) &&
    (!item.roles || hasAnyRole(claims, item.roles))
  );
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
  );
}

/** Route access mirrors nav visibility: a path a user can't see in the nav is a
 *  path they can't open directly. Ungated routes (`/`, `/me`) have no nav gate and
 *  always pass. Building the ability here keeps the `_app` beforeLoad guard a
 *  one-liner and makes nav + route-guard share ONE policy (they can't drift). */
export function canAccessRoute(pathname: string, claims: AuthClaims, uid: string): boolean {
  const item = navItemForPath(pathname);
  return !item || isNavItemVisible(item, buildAbility(claims, uid), claims);
}
