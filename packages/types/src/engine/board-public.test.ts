import { describe, expect, it } from "vitest";
import { isSurfaceableStatus } from "./board-public.js";

describe("isSurfaceableStatus", () => {
  it("surfaces the two standings a member can hold while serving", () => {
    expect(isSurfaceableStatus("Activo")).toBe(true);
    expect(isSurfaceableStatus("Inactivo")).toBe(true);
  });

  it("drops an expelled member", () => {
    expect(isSurfaceableStatus("Desafiliado")).toBe(false);
  });

  it("surfaces a doc that predates the status field", () => {
    // Failing these closed would silently unpublish legacy board members.
    expect(isSurfaceableStatus(undefined)).toBe(true);
  });

  it("fails closed on anything else, so a new status can't surface itself", () => {
    expect(isSurfaceableStatus("Suspendido")).toBe(false);
    expect(isSurfaceableStatus("desafiliado")).toBe(false);
    expect(isSurfaceableStatus("Activo ")).toBe(false);
    expect(isSurfaceableStatus(null)).toBe(false);
    expect(isSurfaceableStatus(42)).toBe(false);
  });
});
