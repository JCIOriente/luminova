import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signIn(email: string, password: string): Promise<void> {
  const { auth } = getFirebase();
  await signInWithEmailAndPassword(auth, email, password);
}
