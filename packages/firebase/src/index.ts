import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { initAppCheck } from "./app-check.js";
import {
  firebaseConfig,
  readFirebaseEnv,
  EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
} from "./firebase-config.js";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
};

const AUTH_PORT = 4030;
const STORAGE_PORT = 9199;
const FUNCTIONS_PORT = 4020;

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (services) return services;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig());

  initAppCheck(app);

  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app);

  if (readFirebaseEnv("VITE_FIREBASE_EMULATOR_ENABLED") === "true") {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    connectStorageEmulator(storage, EMULATOR_HOST, STORAGE_PORT);
    connectFunctionsEmulator(functions, EMULATOR_HOST, FUNCTIONS_PORT);
  }

  services = { app, auth, db, storage, functions };
  return services;
}

export function getStorageService(): FirebaseStorage {
  return getFirebase().storage;
}

export { getFirestoreLite } from "./firestore-lite";
export { uploadMemberPhoto, deleteMemberPhoto } from "./member-photo";
export { uploadAllyLogo, deleteAllyLogo } from "./ally-logo";
export {
  uploadInitiativePhoto,
  deleteInitiativePhoto,
  uploadActivityPhoto,
  deleteActivityPhoto,
} from "./photo-storage";
