import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore/lite";
import { ensureApp, emulatorEnabled, EMULATOR_HOST } from "./app-core.js";
import { FIRESTORE_EMULATOR_PORT } from "./firebase-config.js";

let db: Firestore | null = null;

/**
 * Lite Firestore SDK (one-shot reads + writes, no realtime listeners, no offline
 * cache) for the authenticated admin. Lives on its own subpath so it stays out of
 * the login-path eager graph and only loads inside the lazy feature route chunks.
 */
export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(ensureApp());
  if (emulatorEnabled()) {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return db;
}
