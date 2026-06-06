import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemForPath } from "./nav-config";

describe("nav-config", () => {
  it("only lists routes that exist today", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual(["/", "/members", "/allies"]);
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
