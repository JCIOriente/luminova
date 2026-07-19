import { Icon } from "@luminova/ui";
import { hasAnyRole, type Role, type AuthClaims } from "@luminova/auth/roles";
import { buildAbility, subject, type AppAbility, type Action } from "@luminova/auth/ability";

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
  /** Optional role allowlist — item shows if the caller has one of these built-in
   *  roles OR satisfies `orCan` (below). Used when the viewer set can't be named by
   *  a perm alone (a built-in role shares a coarse read grant with plain Members). */
  roles?: Role[];
  /** Escape hatch ORed with `roles`: a dynamic custom role (perms only, no built-in
   *  role name) that holds this capability is admitted even when it matches no
   *  `roles` entry — so the perms system isn't defeated by the built-in allowlist. */
  orCan?: { action: Action; subject: Subject };
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
        // Gate on the page's actual gating read: the members list (memberPoints/terms are
        // signedIn-only). The empty-probe admits exactly the UNCONDITIONAL read:Member
        // holders — Admin/Membership/Treasury/ExecutiveCommittee AND any perms-only custom
        // role carrying read:Member — mirroring what firestore.rules allow for that list.
        // The old role allowlist both let ProjectManager in (no read:Member → the query
        // died, C1) and locked perms-only custom roles out (C5); one capability fixes both.
        subject: "Member",
      },
      {
        to: "/positions",
        label: "Cargos y comisiones",
        icon: "compass",
        subject: "Position",
        // Members can read Position (chip resolution on /me), and Membership shares
        // ONLY that same read grant — so no perm cleanly separates catalog viewers
        // from Members; hence the built-in allowlist. `orCan` re-admits a dynamic
        // custom role that manages the org chart (manage:Position) but carries no
        // built-in role name, so the route guard doesn't lock the perms system out.
        roles: ["Admin", "Membership", "ExecutiveCommittee"],
        orCan: { action: "manage", subject: "Position" },
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
    // Role allowlist ORed with the `orCan` capability, so a perms-only custom role
    // isn't excluded by an allowlist that exists purely to name built-in roles.
    (!item.roles ||
      hasAnyRole(claims, item.roles) ||
      (item.orCan !== undefined && ability.can(item.orCan.action, subject(item.orCan.subject, {}))))
  );
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
  );
}

interface DetailGate {
  /** Matched by path prefix — `"/initiatives/"` catches `/initiatives/project/xy` but
   *  not the `/initiatives` list itself. */
  prefix: string;
  /** Unconditional read subject that admits the entitled viewers; omit = signed-in only. */
  subject?: Subject;
}

/** A `$`-param DETAIL route's reachability mirrors firestore.rules' PER-DOCUMENT
 *  `read: if signedIn()` — NOT the management-tier gate on its parent LIST. Inheriting
 *  the list gate (via `navItemForPath`'s prefix match) wrongly redirected a direction-lead
 *  plain Member off their own initiative/activity: the rules grant them `isDirection` /
 *  `activityParentDirection` writes, but the list gate (Program / Activity) hid the route.
 *  In-page `<Can>`/ability checks still narrow WRITES; this only restores READ reachability.
 *  A prefix absent here (e.g. `/members/`) keeps inheriting its list gate by design. */
const DETAIL_GATES: DetailGate[] = [
  // Every direction-lead Member holds an unconditional read:Project (management roles do
  // too); Scanner/roleless have no read:Project and no reason to open the initiative page.
  { prefix: "/initiatives/", subject: "Project" },
  // Activity detail must admit BOTH read:Activity holders (Scanner, ProjectManager) and
  // parent-direction plain Members (read:Project, no read:Activity). Their union is broad
  // enough that the honest mirror of the rules' `read: if signedIn()` is signed-in only;
  // the page's own in-component gate ("Sin acceso") narrows what each principal sees.
  { prefix: "/activities/", subject: undefined },
];

/** Route access mirrors nav visibility: a path a user can't see in the nav is a
 *  path they can't open directly. Ungated routes (`/`, `/me`) have no nav gate and
 *  always pass. Detail routes use their own `DETAIL_GATES` read gate (above). Building
 *  the ability here keeps the `_app` beforeLoad guard a one-liner and makes nav +
 *  route-guard share ONE policy (they can't drift). */
export function canAccessRoute(pathname: string, claims: AuthClaims, uid: string): boolean {
  const detail = DETAIL_GATES.find((d) => pathname.startsWith(d.prefix));
  if (detail) {
    return !detail.subject || buildAbility(claims, uid).can("read", subject(detail.subject, {}));
  }
  const item = navItemForPath(pathname);
  return !item || isNavItemVisible(item, buildAbility(claims, uid), claims);
}
