import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeController } from "./theme-controller";
import { setThemePref } from "../lib/ui-prefs";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return { mql, fire: () => listeners.forEach((cb) => cb()) };
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeController", () => {
  it("sets data-theme from an explicit dark pref", () => {
    mockMatchMedia(false);
    setThemePref("dark");
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets data-theme from an explicit light pref", () => {
    mockMatchMedia(true);
    setThemePref("light");
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("resolves 'system' via matchMedia", () => {
    mockMatchMedia(true);
    setThemePref("system");
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("live-updates when the system preference changes", () => {
    const { mql, fire } = mockMatchMedia(false);
    setThemePref("system");
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("light");
    mql.matches = true;
    fire();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
