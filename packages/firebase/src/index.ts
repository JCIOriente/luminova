import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
};

const EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_PORT = 4010;
const AUTH_PORT = 4030;
const STORAGE_PORT = 9199;
const FUNCTIONS_PORT = 4020;

let services: FirebaseServices | null = null;

function env(key: keyof ImportMetaEnv): string | undefined {
  return import.meta.env[key];
}

export function getFirebase(): FirebaseServices {
  if (services) return services;

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

  const debugToken = env("VITE_APPCHECK_DEBUG_TOKEN");
  if (debugToken) {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken;
  }
  const siteKey = env("VITE_APPCHECK_SITE_KEY");
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app);

  if (env("VITE_FIREBASE_EMULATOR_ENABLED") === "true") {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
    connectStorageEmulator(storage, EMULATOR_HOST, STORAGE_PORT);
    connectFunctionsEmulator(functions, EMULATOR_HOST, FUNCTIONS_PORT);
  }

  services = { app, auth, db, storage, functions };
  return services;
}

export function getStorageService(): FirebaseStorage {
  return getFirebase().storage;
}

export { uploadMemberPhoto, deleteMemberPhoto } from "./member-photo";
export {
  initiativePhotoPath,
  activityPhotoPath,
  uploadInitiativePhoto,
  deleteInitiativePhoto,
  uploadActivityPhoto,
  deleteActivityPhoto,
} from "./photo-storage";
