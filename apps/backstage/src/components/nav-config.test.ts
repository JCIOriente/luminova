import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemForPath } from "./nav-config";

describe("nav-config", () => {
  it("only lists routes that exist today", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual(["/", "/members", "/allies", "/point-rules", "/leaderboard"]);
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

  it("groups items under Panel and Gestión labels", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Panel", "Gestión"]);
  });

  it("resolves the active item by exact path", () => {
    expect(navItemForPath("/")?.label).toBe("Inicio");
    expect(navItemForPath("/members")?.label).toBe("Miembros");
    expect(navItemForPath("/unknown")).toBeUndefined();
  });
});
