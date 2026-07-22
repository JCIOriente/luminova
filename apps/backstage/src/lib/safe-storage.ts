/** localStorage wrappers that swallow the throw (private mode, quota, SSR) and fall
 *  back to a safe no-op — mirrors the pattern in `ui-prefs.ts`. */

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota) — non-fatal, keep in-memory only */
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable — non-fatal */
  }
}
