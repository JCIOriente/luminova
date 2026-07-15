import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initAppCheck } from "./app-check.js";
import { firebaseConfig, readFirebaseEnv, EMULATOR_HOST } from "./firebase-config.js";

let app: FirebaseApp | null = null;

/**
 * Initializes (once) and returns the Firebase app + App Check. Shared by the
 * light auth shell and every on-demand service subpath (`/db`, `/storage`,
 * `/functions`) so App Check is wired exactly once regardless of which service
 * is acquired first — and so acquiring firestore/storage/functions never drags
 * them into the login-path eager graph (they live behind their own subpaths).
 */
export function ensureApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  initAppCheck(app);
  return app;
}

export function emulatorEnabled(): boolean {
  return readFirebaseEnv("VITE_FIREBASE_EMULATOR_ENABLED") === "true";
}

export { EMULATOR_HOST };
