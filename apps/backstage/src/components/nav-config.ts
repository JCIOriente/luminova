// Type-only import (erased at runtime) so this module carries NO runtime @luminova/ui
// dependency — it must stay loadable from the isolated firestore-rules-tests package,
// which imports NAV_GROUPS + ROUTE_GATING to reconcile the nav gates against the real
// rules engine (tests/firestore-rules/nav-equivalence.test.ts). lib/authz/probe is safe
// to pull in for the same reason: it imports only @luminova/auth, no React, no UI.
import type { IconKey } from "@luminova/ui";
import { hasAnyRole, type Role, type AuthClaims } from "@luminova/auth/roles";
import { buildAbility, type AppAbility, type Action } from "@luminova/auth/ability";
import { abilityAllows } from "../lib/authz/probe";

type Subject =
  | "Member"
  | "Ally"
  | "PointRule"
  | "Activity"
  | "Attendance"
  | "Program"
  | "Project"
  | "Position"
  | "Lead"
  | "Notification";

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
    | "/notificaciones"
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
  /** Top-level escape hatch ORed with the whole (subject AND roles) gate: a principal
   *  holding this capability is admitted on its own, even when it matches no `roles`
   *  entry AND lacks the item's `subject` read. Two uses: (1) a dynamic custom role
   *  (perms only, no built-in role name) that manages a role-gated catalog isn't excluded
   *  by the built-in allowlist (/positions); (2) an item whose `subject` read is
   *  restrictive still admits a second capability (/notificaciones gates history on
   *  read:Notification, but a compose-only principal holds only create:Notification). */
  orCan?: { action: Action; subject: Subject };
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** ROLE-GATE REGISTER — the three routes that gate on a built-in *role* instead of a
 *  capability, and why a perm gate would be unsound for each. A role gate is the correct
 *  tool ONLY when no server-side capability cleanly names the viewer set:
 *
 *  - `/permisos` + `/config` — mirror the rules' `hasAnyRole(['Admin'])` WRITE boundary on
 *    the claims-mint trust anchors (`roles/`, `siteConfig/current`). These shape the very
 *    perms the ability is built from, so gating them on a *perm* is a self-elevation loop
 *    (a custom role handed that perm could unlock the tool that widens its own perms). Gate
 *    on the Admin role; `nav-equivalence.test.ts`'s escalation probe asserts a perms-only
 *    `manage:all` can NEVER reach them.
 *  - `/positions` — positions read is `signedIn()`, so the viewer set is DEFINITIONALLY a
 *    role set: `read:Position` is overloaded (every Member holds it for /me chip resolution),
 *    so no capability separates catalog curators from Members. Uses `roles + orCan(manage:
 *    Position)` so a dynamic custom role that manages the org chart is still admitted — a
 *    hypothetical `read:PositionCatalog` capability would mirror nothing server-side, so it
 *    stays `roles + orCan` by architect decision.
 *
 *  Every OTHER route gates on a capability (subject-read empty-instance probe), which mirrors
 *  a real rules boundary and admits perms-only custom roles automatically. */
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
      {
        to: "/notificaciones",
        label: "Notificaciones",
        icon: "bell",
        // read:Notification admits history viewers; orCan create:Notification re-admits a
        // compose-only principal (no read) — each op is conditionally in-page-gated, so the
        // nav gate is read OR create (mirrors the /positions orCan escape-hatch pattern).
        subject: "Notification",
        orCan: { action: "create", subject: "Notification" },
      },
      { to: "/point-rules", label: "Reglas de puntos", icon: "target", subject: "PointRule" },
      {
        to: "/leaderboard",
        label: "Clasificación",
        icon: "barChart",
        // Gate on the page's actual gating read: the members list (memberPoints/terms are
        // signedIn-only). The empty-probe admits exactly the UNCONDITIONAL read:Member
        // holders — Admin/Membership/Treasury/ExecutiveCommittee, plain Member (which now
        // carries read:Member by default), AND any perms-only custom role carrying
        // read:Member — mirroring what firestore.rules allow for that list. The old role
        // allowlist both let ProjectManager in (no read:Member → the query died, C1) and
        // locked perms-only custom roles out (C5); one capability fixes both.
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
        // custom role that edits the org chart but carries no built-in role name, so
        // the route guard doesn't lock the perms system out. Keyed on `update` to match
        // the catalog's own rules (canDo('update','Position')), which canDo already
        // treats manage:Position as satisfying — so this admits no principal the rules
        // did not already let write.
        roles: ["Admin", "Membership", "ExecutiveCommittee"],
        orCan: { action: "update", subject: "Position" },
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
        // Gate on Program, NOT Project. `read:Project` is overloaded — a plain Member
        // carries an unconditional one for /me's participation names — so a Project gate
        // says nothing about who should see this catalog. `read:Program` is the honest
        // signal for it: the management tier (Admin/ExecutiveCommittee/ProjectManager)
        // plus plain Member, which now carries read:Program by default so members can
        // browse the projects catalog. Reads are signed-in in rules; writes stay gated.
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
  // `orCan` is a TOP-LEVEL escape hatch ORed with the whole (subject AND roles) gate:
  // a capability that admits the item on its own. This matters when the item's `subject`
  // read is restrictive — /notificaciones gates history on read:Notification, so a
  // compose-only principal (create:Notification, no read) would fail the subject clause;
  // the escape hatch admits them without widening that gate. For /positions it is
  // behavior-identical to ORing inside the roles clause, since manage:Position ⊇ read.
  if (item.orCan && abilityAllows(ability, item.orCan.action, item.orCan.subject)) return true;
  return (
    // Probe an EMPTY subject instance, not the bare subject type. A conditional
    // grant — e.g. a Member's own-doc `can('read','Member',{uid})` — must NOT
    // satisfy a collection-level nav gate: CASL's type-level `can('read','Member')`
    // returns true whenever ANY conditional grant exists, which showed a plain
    // Member the admin Miembros nav + route, then died on the unconditional list
    // query that firestore.rules (correctly) denies. An empty instance matches
    // only UNCONDITIONAL grants — mirroring what the rules actually allow for a list.
    (!item.subject || abilityAllows(ability, item.action ?? "read", item.subject)) &&
    // Built-in role allowlist. A perms-only custom role that should still reach the item
    // is re-admitted by `orCan` (handled above), so the allowlist doesn't defeat perms.
    (!item.roles || hasAnyRole(claims, item.roles))
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
    return !detail.subject || abilityAllows(buildAbility(claims, uid), "read", detail.subject);
  }
  const item = navItemForPath(pathname);
  return !item || isNavItemVisible(item, buildAbility(claims, uid), claims);
}

export type GatingProbe =
  | { kind: "listRead"; collection: string }
  | { kind: "write"; collection: string; op: "create" | "update" }
  | { kind: "curationOnly"; note: string; collections: string[] };

/** Which `firestore.rules` boundary each nav item's gate CLAIMS TO MIRROR — never *who*
 *  is allowed (that stays in the rules + CASL). Consumed only by the emulator
 *  reconciliation test (`tests/firestore-rules/nav-equivalence.test.ts`), which asserts,
 *  per principal: `navVisible(item) ⟹ emulatorAllows(probe)` — no route is OFFERED whose
 *  defining rules-gated op the real engine denies (no render-then-die, no perm-vs-role
 *  escalation surface). NOT a policy table; it verifies nothing about who's allowed.
 *
 *  - `listRead`: the page fires an unfiltered LIST as its primary load; a denied list is a
 *    dead page. The nav empty-instance probe already models "unconditional grant ⇒ can list".
 *  - `write`: an admin-power route whose reason to exist is a rules-gated WRITE; the invariant
 *    is that only principals who can perform it are offered the route (catches a future
 *    perm-gate regression on a role-gated trust anchor).
 *  - `curationOnly`: the gated collection is `read: if signedIn()` (or the route reads
 *    several), so no single rules boundary mirrors the nav gate — the gate is UX curation
 *    stricter than the rules. Excluded from the implication; visibility is pinned by
 *    `nav-config` unit tests instead.
 *
 *  `/` and `/me` are ungated (`canAccessRoute` returns true) and are omitted; the test
 *  asserts every other nav item has an entry so this map can't silently lag the nav. */
export const ROUTE_GATING: Partial<Record<NavItem["to"], GatingProbe>> = {
  "/members": { kind: "listRead", collection: "members" },
  "/allies": { kind: "listRead", collection: "allies" },
  "/leads": { kind: "listRead", collection: "leads" },
  "/notificaciones": {
    kind: "curationOnly",
    collections: ["notifications"],
    note: "compose page: create:Notification gates the composer, read:Notification gates the sent-history list — each op is conditionally in-page-gated, so nav visibility (read OR create) mirrors no single rules boundary",
  },
  "/leaderboard": { kind: "listRead", collection: "members" },
  "/permisos": { kind: "write", collection: "roles", op: "create" },
  "/config": { kind: "write", collection: "siteConfig", op: "update" },
  "/point-rules": {
    kind: "curationOnly",
    collections: ["pointRules"],
    note: "pointRules read=signedIn; nav read:PointRule (Admin-only today) is curation, authoring writes are Admin-gated + covered by rules.test.ts",
  },
  "/positions": {
    kind: "curationOnly",
    collections: ["positions"],
    note: "positions read=signedIn; viewer set is a role set (read:Position is overloaded by /me chips)",
  },
  "/activities": {
    kind: "curationOnly",
    collections: ["activities"],
    note: "activities read=signedIn; nav read:Activity (incl. Scanner) is UX curation",
  },
  "/initiatives": {
    kind: "curationOnly",
    collections: ["programs", "projects"],
    note: "programs read=signedIn; nav read:Program is a management-tier proxy for a programs+projects route",
  },
};
