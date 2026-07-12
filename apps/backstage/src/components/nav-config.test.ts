import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemForPath } from "./nav-config";

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

  it("gates initiatives on the Program OR Project subjects", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/initiatives");
    expect(item?.label).toBe("Proyectos");
    expect(item?.subject).toBeUndefined();
    expect(item?.anySubject).toEqual(["Program", "Project"]);
  });

  it("lists Mi panel ungated", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/me");
    expect(item?.label).toBe("Mi panel");
    expect(item?.subject).toBeUndefined();
    expect(item?.roles).toBeUndefined();
  });

  it("gates the leaderboard to non-member roles (broken for plain Members until projection)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/leaderboard");
    expect(item?.roles).toEqual([
      "Admin",
      "Membership",
      "Treasury",
      "ExecutiveCommittee",
      "ProjectManager",
    ]);
    expect(item?.roles).not.toContain("Member");
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

  it("lists the leaderboard ungated (public to all members)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/leaderboard");
    expect(item?.label).toBe("Clasificación");
    expect(item?.subject).toBeUndefined();
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
