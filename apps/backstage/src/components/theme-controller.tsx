import { useEffect, useSyncExternalStore } from "react";
import { getThemePref, subscribe } from "../lib/ui-prefs";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function ThemeController() {
  const pref = useSyncExternalStore(subscribe, getThemePref, getThemePref);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const resolved = pref === "system" ? (prefersDark() ? "dark" : "light") : pref;
      root.dataset.theme = resolved;
    };

    apply();

    if (pref !== "system") return;

    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [pref]);

  return null;
}
