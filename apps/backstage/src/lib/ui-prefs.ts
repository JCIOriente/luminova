export type ThemePref = "light" | "dark" | "system";

const THEME_KEY = "luminova.theme";
const SIDEBAR_KEY = "luminova.sidebarCollapsed";

const DEFAULT_THEME: ThemePref = "system";
const DEFAULT_SIDEBAR_COLLAPSED = false;

const listeners = new Set<() => void>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, SSR) — keep in-memory only */
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getThemePref(): ThemePref {
  const raw = readStorage(THEME_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_THEME;
}

export function setThemePref(value: ThemePref): void {
  writeStorage(THEME_KEY, value);
  emit();
}

export function getSidebarCollapsed(): boolean {
  const raw = readStorage(SIDEBAR_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return DEFAULT_SIDEBAR_COLLAPSED;
}

export function setSidebarCollapsed(value: boolean): void {
  writeStorage(SIDEBAR_KEY, value ? "true" : "false");
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
