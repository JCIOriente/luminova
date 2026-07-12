import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore/lite";
import { initAppCheck } from "./app-check.js";
import {
  firebaseConfig,
  readFirebaseEnv,
  EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
} from "./firebase-config.js";

let db: Firestore | null = null;

/**
 * Read-only Firestore via the lite SDK (one-shot get only, no realtime listeners).
 * Used by the public spotlight showcase — bundles App Check (reCAPTCHA v3) so its
 * public reads and the lead-capture write send a valid token under Firestore
 * App Check enforcement, but still skips auth/storage/functions.
 */
export function getFirestoreLite(): Firestore {
  if (db) return db;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  initAppCheck(app);
  db = getFirestore(app);
  if (readFirebaseEnv("VITE_FIREBASE_EMULATOR_ENABLED") === "true") {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return db;
}
