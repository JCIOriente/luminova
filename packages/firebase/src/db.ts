import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { ensureApp, emulatorEnabled, EMULATOR_HOST } from "./app-core.js";
import { FIRESTORE_EMULATOR_PORT } from "./firebase-config.js";

let db: Firestore | null = null;

/**
 * Full Firestore SDK (realtime listeners + writes) for the authenticated admin.
 * Lives on its own subpath so the ~85 kB firestore module stays out of the
 * login-path eager graph and only loads inside the lazy feature route chunks.
 */
export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(ensureApp());
  if (emulatorEnabled()) {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return db;
}
