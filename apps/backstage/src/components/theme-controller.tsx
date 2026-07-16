import { useEffect, useSyncExternalStore } from "react";
import { getThemePref, subscribe } from "../lib/ui-prefs";

export function ThemeController() {
  const pref = useSyncExternalStore(subscribe, getThemePref, getThemePref);

  useEffect(() => {
    document.documentElement.dataset.theme = pref;
  }, [pref]);

  return null;
}
