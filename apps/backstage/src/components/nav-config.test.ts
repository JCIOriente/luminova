import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { AuthClaims, Role } from "@luminova/auth/roles";
import type { PermissionCode } from "@luminova/types";
import { NAV_GROUPS, navItemForPath, isNavItemVisible, canAccessRoute } from "./nav-config";

const SELF_UID = "uid-self";
const claimsFor = roleClaims;
const navItem = (to: string) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === to)!;
const canSee = (to: string, claims: AuthClaims) =>
  isNavItemVisible(navItem(to), buildAbility(claims, SELF_UID), claims);

// Derive the registered routes from the generated router tree (the single source of
// truth), not a hand-typed mirror of NAV_GROUPS — so a nav entry pointing at a
// deleted/renamed route, or a new _app route with no nav entry, both go red.
// vitest runs with cwd = apps/backstage (jsdom env has no file: import.meta.url).
const ROUTE_TREE = readFileSync(resolve(process.cwd(), "src/routeTree.gen.ts"), "utf8");
const REGISTERED_PATHS = [...ROUTE_TREE.matchAll(/fullPath: '([^']*)'/g)].map((m) => m[1]!);
// Content routes that live off the sidebar by design: pre-auth pages + dynamic detail
// routes (any segment with a `$` param). Everything else must have exactly one nav entry.
const AUTH_ROUTES = ["/login", "/forgot-password", "/reset"];
const CONTENT_ROUTES = REGISTERED_PATHS.filter((p) => !p.includes("$"));
const NAV_PATHS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));

describe("nav-config", () => {
  it("only points at routes registered in the generated route tree", () => {
    for (const path of NAV_PATHS) expect(REGISTERED_PATHS).toContain(path);
  });

  it("covers every _app content route (minus the deliberate auth allowlist)", () => {
    expect(new Set(CONTENT_ROUTES)).toEqual(new Set([...NAV_PATHS, ...AUTH_ROUTES]));
  });

  it("puts every registered _app route — incl. dynamic detail routes — behind a nav gate", () => {
    // canAccessRoute fails OPEN for a path with no matching nav item. The check
    // above only covers static routes; assert the `$`-param detail routes resolve
    // to a (parent) nav item too, so no future all-dynamic admin route can slip
    // past the _app beforeLoad guard ungated. (claim == reality, guardrail #6.)
    for (const path of REGISTERED_PATHS) {
      if (AUTH_ROUTES.includes(path)) continue;
      expect(navItemForPath(path), `no nav gate covers ${path}`).toBeDefined();
    }
  });

  it("gates initiatives on the Program subject (management tier, not the Member's read:Project)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/initiatives");
    expect(item?.label).toBe("Proyectos");
    expect(item?.subject).toBe("Program");
  });

  it("lists Mi panel ungated", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/me");
    expect(item?.label).toBe("Mi panel");
    expect(item?.subject).toBeUndefined();
    expect(item?.roles).toBeUndefined();
  });

  it("gates the leaderboard on unconditional read:Member, not a role allowlist", () => {
    // The page's gating read is the members list (memberPoints/terms are signedIn-only);
    // ProjectManager was on the old allowlist but holds no read:Member, so the members
    // query the rules deny made it a dead page (C1). A perms-only custom role holding
    // read:Member was locked out despite the rules allowing it (C5). One capability gate
    // fixes both: the empty-probe admits exactly the unconditional read:Member holders.
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/leaderboard");
    expect(item?.subject).toBe("Member");
    expect(item?.roles).toBeUndefined();
  });

  it("gates activities on the Activity subject (read)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/activities");
    expect(item?.subject).toBe("Activity");
    expect(item?.action).toBeUndefined();
    expect(item?.label).toBe("Actividades");
  });

  it("gates positions on the Position subject", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/positions");
    expect(item?.subject).toBe("Position");
    expect(item?.action).toBeUndefined();
    expect(item?.label).toBe("Cargos y comisiones");
    expect(item?.roles).toEqual(["Admin", "Membership", "ExecutiveCommittee"]);
  });

  it("gates point rules on the PointRule subject", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/point-rules");
    expect(item?.subject).toBe("PointRule");
    expect(item?.label).toBe("Reglas de puntos");
  });

  it("shows the leaderboard to unconditional read:Member holders (incl. plain Member); hides PM/Scanner", () => {
    // Member now carries read:Member by default, so it joins the management roles here.
    for (const role of [
      "Admin",
      "Membership",
      "Treasury",
      "ExecutiveCommittee",
      "Member",
    ] as Role[]) {
      expect(canSee("/leaderboard", claimsFor(role))).toBe(true);
    }
    // ProjectManager and Scanner hold no read:Member — the members query behind
    // /leaderboard would be denied for them by firestore.rules.
    for (const role of ["ProjectManager", "Scanner"] as Role[]) {
      expect(canSee("/leaderboard", claimsFor(role))).toBe(false);
    }
  });

  it("admits a perms-only custom role holding read:Member to the leaderboard (C5)", () => {
    expect(canSee("/leaderboard", { roles: [], perms: ["read:Member"] })).toBe(true);
    expect(canSee("/leaderboard", { roles: [], perms: ["manage:Position"] })).toBe(false);
  });

  it("groups items under Panel, Gestión, Reconocimiento and Sitio labels", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Panel", "Gestión", "Reconocimiento", "Sitio"]);
  });

  it("resolves the active item by exact path", () => {
    expect(navItemForPath("/")?.label).toBe("Inicio");
    expect(navItemForPath("/members")?.label).toBe("Miembros");
    expect(navItemForPath("/unknown")).toBeUndefined();
  });
});

describe("isNavItemVisible — conditional grants must not leak", () => {
  it("does not let a conditional-only own-doc read:Member satisfy the collection gate", () => {
    // The empty-instance probe's core guard: a Member whose ONLY read:Member is the
    // own-doc conditional grant (no coarse perm) must NOT see the admin Miembros nav —
    // CASL's type-level can('read','Member') is true for it, but the list query
    // firestore.rules deny would die. A bare {roles:['Member'], perms:[]} isolates that
    // conditional grant from the seeded coarse read:Member the role now also carries.
    expect(canSee("/members", { roles: ["Member"], perms: [] })).toBe(false);
  });

  it("shows Miembros to the unconditional read:Member roles, including a seeded plain Member", () => {
    for (const role of [
      "Admin",
      "Membership",
      "Treasury",
      "ExecutiveCommittee",
      "Member",
    ] as Role[]) {
      expect(canSee("/members", claimsFor(role))).toBe(true);
    }
    for (const role of ["ProjectManager", "Scanner"] as Role[]) {
      expect(canSee("/members", claimsFor(role))).toBe(false);
    }
  });

  it("shows Proyectos to a plain Member (read:Program by default) and the management tier", () => {
    for (const role of ["Admin", "ExecutiveCommittee", "ProjectManager", "Member"] as Role[]) {
      expect(canSee("/initiatives", claimsFor(role))).toBe(true);
    }
    for (const role of ["Membership", "Treasury", "Scanner"] as Role[]) {
      expect(canSee("/initiatives", claimsFor(role))).toBe(false);
    }
  });

  it("admits a perms-only custom role (manage:Position) to /positions, still excludes Members", () => {
    // The built-in allowlist exists because Membership and a plain Member share the
    // same coarse read:Position grant. `orCan` must still let a dynamic custom role
    // that manages the org chart through — without re-admitting the Member.
    const positionManager: AuthClaims = { roles: [], perms: ["manage:Position"] };
    expect(canSee("/positions", positionManager)).toBe(true);
    expect(canSee("/positions", claimsFor("Membership"))).toBe(true);
    expect(canSee("/positions", claimsFor("Member"))).toBe(false);
    expect(canSee("/positions", claimsFor("Treasury"))).toBe(false);
  });

  it("shows /notificaciones to a compose-only principal (create:Notification, no read)", () => {
    // The page's history list gates on read:Notification, but a compose-only principal
    // holds only create:Notification. The item's `subject: Notification` read would hide
    // them, so `orCan(create:Notification)` (a top-level escape hatch) must re-admit them —
    // otherwise the composer they CAN use is unreachable. A read:Notification-only principal
    // stays visible via the subject clause; a principal with neither is hidden.
    expect(canSee("/notificaciones", { roles: [], perms: ["create:Notification"] })).toBe(true);
    expect(canSee("/notificaciones", { roles: [], perms: ["read:Notification"] })).toBe(true);
    expect(canSee("/notificaciones", { roles: [], perms: ["read:Member"] })).toBe(false);
    expect(canSee("/notificaciones", claimsFor("Member"))).toBe(false);
  });
});

describe("curationOnly routes — pinned visibility sets (nav-equivalence Check A skips these)", () => {
  // These four gate on a `read: if signedIn()` collection, so no single firestore.rules
  // boundary mirrors the nav gate (it's UX curation stricter than the rules) and
  // nav-equivalence.test.ts (Check A) deliberately excludes them from its implication.
  // Pin the EXACT built-in visibility set here so a gate regression on a curation route
  // can't slip through un-probed. Keep in sync with the ROUTE_GATING `curationOnly` notes.
  const ALL_ROLES: Role[] = [
    "Admin",
    "Membership",
    "Treasury",
    "ExecutiveCommittee",
    "ProjectManager",
    "Scanner",
    "Member",
  ];
  const cases: { route: string; visible: Role[]; admits: PermissionCode }[] = [
    {
      route: "/positions",
      visible: ["Admin", "Membership", "ExecutiveCommittee"],
      admits: "manage:Position",
    },
    { route: "/point-rules", visible: ["Admin"], admits: "read:PointRule" },
    {
      route: "/activities",
      visible: ["Admin", "ProjectManager", "Scanner", "Member"],
      admits: "read:Activity",
    },
    {
      route: "/initiatives",
      visible: ["Admin", "ExecutiveCommittee", "ProjectManager", "Member"],
      admits: "read:Program",
    },
  ];

  for (const { route, visible, admits } of cases) {
    it(`${route} is visible to exactly {${visible.join(", ")}} among built-in roles`, () => {
      for (const role of ALL_ROLES) {
        expect(canSee(route, claimsFor(role)), `${role} -> ${route}`).toBe(visible.includes(role));
      }
    });
    it(`${route} still admits a perms-only custom role holding ${admits}`, () => {
      expect(canSee(route, { roles: [], perms: [admits] })).toBe(true);
    });
  }
});

describe("canAccessRoute — route guard mirrors nav visibility", () => {
  const MEMBER = claimsFor("Member");
  const ADMIN = claimsFor("Admin");

  it("lets any signed-in user reach the ungated home + panel", () => {
    expect(canAccessRoute("/", MEMBER, SELF_UID)).toBe(true);
    expect(canAccessRoute("/me", MEMBER, SELF_UID)).toBe(true);
  });

  it("blocks a plain Member from the management routes it holds no read for", () => {
    // A seeded Member now reads members/activities/programs, so /members, /leaderboard,
    // /activities and /initiatives are legitimately open (see nav visibility tests). The
    // routes below gate on reads/roles a Member still lacks.
    for (const path of [
      "/allies",
      "/leads",
      "/point-rules",
      "/positions",
      "/permisos",
      "/config",
    ]) {
      expect(canAccessRoute(path, MEMBER, SELF_UID)).toBe(false);
    }
  });

  it("opens the member-facing routes a seeded Member now reads", () => {
    for (const path of ["/members", "/leaderboard", "/activities", "/initiatives"]) {
      expect(canAccessRoute(path, MEMBER, SELF_UID)).toBe(true);
    }
  });

  it("keeps admin DETAIL routes that inherit a LIST gate blocked for a principal without the read", () => {
    // A detail route with no relaxed gate inherits its parent LIST gate. Scanner holds
    // no read:Member, so member detail stays blocked (mirrors the denied list query).
    expect(canAccessRoute("/members/abc123", claimsFor("Scanner"), SELF_UID)).toBe(false);
  });

  it("lets an Admin reach the management routes", () => {
    for (const path of ["/members", "/config", "/permisos", "/initiatives"]) {
      expect(canAccessRoute(path, ADMIN, SELF_UID)).toBe(true);
    }
  });
});

describe("canAccessRoute — detail routes mirror the per-doc read, not the list gate", () => {
  // #183 made every `$`-param detail route inherit its parent LIST nav gate via the
  // navItemForPath prefix match. That over-corrected: a direction-lead plain Member —
  // whom firestore.rules grant isDirection / activityParentDirection writes on their own
  // initiative/activity — was redirected off the page before it could render (C6/C7).
  // Detail reachability must mirror the rules' per-doc `read: if signedIn()` instead.
  const MEMBER = claimsFor("Member");
  const SCANNER = claimsFor("Scanner");
  const ROLELESS = claimsFor();

  it("lets a Member reach an initiative DETAIL route via unconditional read:Project (C6)", () => {
    expect(canAccessRoute("/initiatives/project/xy", MEMBER, SELF_UID)).toBe(true);
    expect(canAccessRoute("/initiatives/program/xy", MEMBER, SELF_UID)).toBe(true);
  });

  it("opens the initiatives LIST to a Member (read:Program by default; detail also reachable)", () => {
    expect(canAccessRoute("/initiatives", MEMBER, SELF_UID)).toBe(true);
  });

  it("still blocks Scanner/roleless from initiative detail (no read:Project)", () => {
    expect(canAccessRoute("/initiatives/project/xy", SCANNER, SELF_UID)).toBe(false);
    expect(canAccessRoute("/initiatives/project/xy", ROLELESS, SELF_UID)).toBe(false);
  });

  it("lets any authenticated user reach an activity DETAIL route (rules read = signedIn) (C7)", () => {
    expect(canAccessRoute("/activities/xy", MEMBER, SELF_UID)).toBe(true);
    expect(canAccessRoute("/activities/xy", SCANNER, SELF_UID)).toBe(true);
  });

  it("opens the activities LIST to a Member (read:Activity by default)", () => {
    expect(canAccessRoute("/activities", MEMBER, SELF_UID)).toBe(true);
  });
});
