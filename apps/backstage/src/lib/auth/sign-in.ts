import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signIn(email: string, password: string, remember: boolean): Promise<void> {
  const { auth } = getFirebase();
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}
