import type { FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { ensureApp, emulatorEnabled, EMULATOR_HOST } from "./app-core.js";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
};

const AUTH_PORT = 4030;

let services: FirebaseServices | null = null;

/**
 * The light login-path shell: app + auth + App Check only. Firestore, storage,
 * and functions are acquired on demand from `@luminova/firebase/db|storage|
 * functions` so they stay out of the eager graph that `main.tsx` pulls in.
 */
export function getFirebase(): FirebaseServices {
  if (services) return services;

  const app = ensureApp();
  const auth = getAuth(app);

  if (emulatorEnabled()) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    });
  }

  services = { app, auth };
  return services;
}
