import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemForPath } from "./nav-config";

describe("nav-config", () => {
  it("only lists routes that exist today", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual([
      "/",
      "/me",
      "/members",
      "/allies",
      "/point-rules",
      "/leaderboard",
      "/positions",
      "/activities",
      "/initiatives",
      "/check-in",
    ]);
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

  it("gates check-in on Attendance with the checkIn action", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/check-in");
    expect(item?.subject).toBe("Attendance");
    expect(item?.action).toBe("checkIn");
    expect(item?.label).toBe("Check-in");
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

  it("groups items under Panel, Gestión and Reconocimiento labels", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Panel", "Gestión", "Reconocimiento"]);
  });

  it("resolves the active item by exact path", () => {
    expect(navItemForPath("/")?.label).toBe("Inicio");
    expect(navItemForPath("/members")?.label).toBe("Miembros");
    expect(navItemForPath("/unknown")).toBeUndefined();
  });
});
