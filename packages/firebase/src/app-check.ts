import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { readFirebaseEnv } from "./firebase-config.js";

/**
 * Initializes Firebase App Check (reCAPTCHA v3) on the given app when a site key
 * is configured. Shared by the full SDK entry (backstage) and the lite read path
 * (spotlight) so both send a valid App Check token once Firestore/Storage
 * enforcement is enabled. A blank site key disables App Check; a debug token
 * registered under App Check > Manage debug tokens unlocks localhost.
 */
export function initAppCheck(app: FirebaseApp): void {
  const debugToken = readFirebaseEnv("VITE_APPCHECK_DEBUG_TOKEN");
  if (debugToken) {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken;
  }
  const siteKey = readFirebaseEnv("VITE_APPCHECK_SITE_KEY");
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}
