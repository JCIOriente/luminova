import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, setDoc, type Firestore } from "firebase/firestore";
import { buildAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";
// The SAME source of truth the app renders + guards routes from. This module carries no
// runtime @luminova/ui dependency (type-only IconKey import), so it loads here.
import {
  NAV_GROUPS,
  isNavItemVisible,
  ROUTE_GATING,
  type GatingProbe,
  type NavItem,
} from "../../apps/backstage/src/components/nav-config";
import { permsForRoles } from "../../tools/scripts/lib/role-seed.mjs";

// The contract: for every gated nav item and every principal, if the UI OFFERS the route
// (`isNavItemVisible`), the real rules engine must ALLOW the route's defining operation
// (`ROUTE_GATING`). One principal fixture drives both sides — the nav ability is built from
// the exact claims the emulator context receives — so a nav gate that admits someone the
// rules deny (a render-then-die dead page, or a perm-vs-role escalation surface) fails here.
// This is an IMPLICATION, not equality: it never flags intentional curation (nav hides a
// route the rules would allow), and it verifies NOTHING about write-integrity conjuncts —
// those remain the sole province of rules.test.ts.

const PROJECT_ID = "demo-nav-equivalence";
let env: RulesTestEnvironment;

interface Principal {
  label: string;
  uid: string;
  roles: string[];
  perms: string[];
}
const canonical = (role: string): Principal => ({
  label: role,
  uid: `${role.toLowerCase()}-uid`,
  roles: [role],
  perms: permsForRoles([role]),
});
const custom = (label: string, perms: string[]): Principal => ({
  label: `custom(${label})`,
  uid: `${label}-uid`,
  roles: [],
  perms,
});

const PRINCIPALS: Principal[] = [
  ...[
    "Admin",
    "Membership",
    "Treasury",
    "ExecutiveCommittee",
    "ProjectManager",
    "Scanner",
    "Member",
  ].map(canonical),
  // Adversarial custom roles (perms only, no built-in role NAME) — the C1/C5 axis:
  custom("manage-all", ["manage:all"]), // escalation probe: must NOT be offered the role-gated admin routes
  custom("manage-Position", ["manage:Position"]), // org-chart custom role the /positions orCan re-admits
  custom("read-Member", ["read:Member"]), // must be offered /members + /leaderboard the rules let it list
  { label: "roleless", uid: "roleless-uid", roles: [], perms: [] },
];

// Bridge the seed producer's plain string arrays (role-seed.mjs) to the typed claim.
const claimsOf = (p: Principal): AuthClaims =>
  ({ roles: p.roles, perms: p.perms }) as unknown as AuthClaims;

function as(p: Principal): Firestore {
  return env.authenticatedContext(p.uid, { roles: p.roles, perms: p.perms }).firestore();
}
function navVisible(item: NavItem, p: Principal): boolean {
  return isNavItemVisible(item, buildAbility(claimsOf(p), p.uid), claimsOf(p));
}

const ROLE_DOC = {
  name: "Coordinador",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: ["manage:Position"],
  locked: false,
  active: true,
  deletedAt: null,
};
const SITE_CONFIG = { version: 2, stats: {}, allies: [] };

function runProbe(
  db: Firestore,
  probe: Extract<GatingProbe, { kind: "listRead" | "write" }>,
  uid: string,
) {
  if (probe.kind === "listRead") return getDocs(collection(db, probe.collection));
  if (probe.collection === "roles") return setDoc(doc(db, `roles/probe-${uid}`), ROLE_DOC);
  if (probe.collection === "siteConfig") return setDoc(doc(db, "siteConfig/current"), SITE_CONFIG);
  throw new Error(`nav-equivalence: no write payload wired for collection '${probe.collection}'`);
}

const UNGATED = new Set(["/", "/me"]);
const navItems = NAV_GROUPS.flatMap((g) => g.items);

beforeAll(async () => {
  const rulesPath = resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url)));
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 4010),
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    // siteConfig/current must exist so the /config write probe is an update.
    await setDoc(doc(ctx.firestore(), "siteConfig/current"), { version: 1, stats: {}, allies: [] });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("nav ⟷ rules: every OFFERED route's defining op is allowed by the emulator", () => {
  it("every gated nav item has a ROUTE_GATING entry (the map can't silently lag the nav)", () => {
    for (const item of navItems) {
      if (UNGATED.has(item.to)) continue;
      expect(ROUTE_GATING[item.to], `no ROUTE_GATING entry for ${item.to}`).toBeDefined();
    }
  });

  // The implication below is vacuous where no principal is offered a route, so assert the
  // probe is actually exercised — a route that regresses to zero-visibility would otherwise
  // go silently untested and could become a render-then-die page unnoticed.
  it("every listRead/write route is offered to at least one principal (its probe runs)", () => {
    for (const item of navItems) {
      if (UNGATED.has(item.to)) continue;
      const probe = ROUTE_GATING[item.to];
      if (!probe || probe.kind === "curationOnly") continue;
      const offered = PRINCIPALS.some((p) => navVisible(item, p));
      expect(
        offered,
        `no principal is offered ${item.to} — its ${probe.kind} probe never runs`,
      ).toBe(true);
    }
  });

  // Assert the escalation invariant directly, not by the mere absence of a generated case: a
  // perms-only principal (even manage:all) must NEVER be offered a role-gated admin-power
  // route. These gate the claims-mint trust anchor (roles/, siteConfig); a perm unlocking
  // them would be a self-elevation loop. Guards a future swap of the role gate for a perm gate.
  it("no role-gated write route is offered to the perms-only manage:all escalation probe", () => {
    const escalation = PRINCIPALS.find((p) => p.label === "custom(manage-all)")!;
    for (const item of navItems) {
      if (ROUTE_GATING[item.to]?.kind !== "write") continue;
      expect(
        navVisible(item, escalation),
        `manage:all is offered ${item.to} — a perm must not unlock a role-gated trust anchor`,
      ).toBe(false);
    }
  });

  for (const item of navItems) {
    if (UNGATED.has(item.to)) continue;
    const probe = ROUTE_GATING[item.to];
    // curationOnly = the gated collection is signedIn-readable (or multi-collection), so no
    // single rules boundary mirrors the gate; visibility is pinned by nav-config unit tests.
    if (!probe || probe.kind === "curationOnly") continue;

    for (const p of PRINCIPALS) {
      if (!navVisible(item, p)) continue;
      it(`${p.label} is offered ${item.to} ⟹ rules allow ${probe.kind}:${probe.collection}`, async () => {
        await assertSucceeds(runProbe(as(p), probe, p.uid));
      });
    }
  }
});
