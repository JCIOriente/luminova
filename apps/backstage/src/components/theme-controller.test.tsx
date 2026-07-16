import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeController } from "./theme-controller";
import { setThemePref } from "../lib/ui-prefs";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeController", () => {
  it("sets data-theme from an explicit dark pref", () => {
    setThemePref("dark");
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets data-theme from an explicit light pref", () => {
    setThemePref("light");
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("defaults to light when no pref is stored", () => {
    render(<ThemeController />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
