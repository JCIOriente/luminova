import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getThemePref,
  setThemePref,
  getSidebarCollapsed,
  setSidebarCollapsed,
  subscribe,
} from "./ui-prefs";

beforeEach(() => {
  window.localStorage.clear();
});

describe("ui-prefs theme", () => {
  it("defaults to system on empty storage", () => {
    expect(getThemePref()).toBe("system");
  });

  it("round-trips a theme value through localStorage", () => {
    setThemePref("dark");
    expect(getThemePref()).toBe("dark");
    setThemePref("light");
    expect(getThemePref()).toBe("light");
  });

  it("falls back to system on corrupt storage", () => {
    window.localStorage.setItem("luminova.theme", "neon");
    expect(getThemePref()).toBe("system");
  });
});

describe("ui-prefs sidebarCollapsed", () => {
  it("defaults to false on empty storage", () => {
    expect(getSidebarCollapsed()).toBe(false);
  });

  it("round-trips the collapsed flag through localStorage", () => {
    setSidebarCollapsed(true);
    expect(getSidebarCollapsed()).toBe(true);
    setSidebarCollapsed(false);
    expect(getSidebarCollapsed()).toBe(false);
  });

  it("falls back to false on corrupt storage", () => {
    window.localStorage.setItem("luminova.sidebarCollapsed", "maybe");
    expect(getSidebarCollapsed()).toBe(false);
  });
});

describe("ui-prefs subscribe", () => {
  it("fires listeners on theme change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setThemePref("dark");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setThemePref("light");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fires listeners on sidebar change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setSidebarCollapsed(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
