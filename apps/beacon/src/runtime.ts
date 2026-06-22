import { getApps, initializeApp } from "firebase-admin/app";

/** Initialize the default admin app if a callable runs before index.ts's
 *  module-load init (defensive — all functions in this codebase share that init). */
export function ensureApp(): void {
  if (!getApps().length) initializeApp();
}

/** UTC-year term key (matches @luminova/types currentTermKey; inlined to keep the
 *  zod-laden types barrel out of this bundle path). */
export function currentTermKey(): string {
  return String(new Date().getUTCFullYear());
}
