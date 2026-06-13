import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore/lite";
import {
  firebaseConfig,
  readFirebaseEnv,
  EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
} from "./firebase-config.js";

let db: Firestore | null = null;

/**
 * Read-only Firestore via the lite SDK (one-shot get only, no realtime listeners).
 * Used by the public spotlight showcase so it doesn't bundle auth/storage/functions/app-check.
 */
export function getFirestoreLite(): Firestore {
  if (db) return db;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  db = getFirestore(app);
  if (readFirebaseEnv("VITE_FIREBASE_EMULATOR_ENABLED") === "true") {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return db;
}
