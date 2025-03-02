import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

if (process.env.FIREBASE_EMULATOR_ENABLED) {
  const defaultPort = '4010';
  const emulatorPort = process.env.FIREBASE_FIRESTORE_EMULATOR_PORT;
  const port = Number.parseInt(emulatorPort || defaultPort, 10);
  connectFirestoreEmulator(db, '127.0.0.1', port);
}

export { auth, db, storage };
