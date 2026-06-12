export function readFirebaseEnv(key: keyof ImportMetaEnv): string | undefined {
  return import.meta.env[key];
}

export function firebaseConfig() {
  return {
    apiKey: readFirebaseEnv("VITE_FIREBASE_API_KEY"),
    authDomain: readFirebaseEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: readFirebaseEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: readFirebaseEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readFirebaseEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readFirebaseEnv("VITE_FIREBASE_APP_ID"),
  };
}

export const EMULATOR_HOST = "127.0.0.1";
export const FIRESTORE_EMULATOR_PORT = 4010;
