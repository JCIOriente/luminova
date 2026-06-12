import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore/lite";

const EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_PORT = 4010;

let db: Firestore | null = null;

function env(key: keyof ImportMetaEnv): string | undefined {
  return import.meta.env[key];
}

/**
 * Read-only Firestore via the lite SDK (one-shot get only, no realtime listeners).
 * Used by the public spotlight showcase so it doesn't bundle auth/storage/functions/app-check.
 */
export function getFirestoreLite(): Firestore {
  if (db) return db;
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env("VITE_FIREBASE_API_KEY"),
        authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
        projectId: env("VITE_FIREBASE_PROJECT_ID"),
        storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
        messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
        appId: env("VITE_FIREBASE_APP_ID"),
      });
  db = getFirestore(app);
  if (env("VITE_FIREBASE_EMULATOR_ENABLED") === "true") {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
  }
  return db;
}
