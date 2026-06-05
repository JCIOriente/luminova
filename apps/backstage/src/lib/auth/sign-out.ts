import { signOut } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebase();
  await signOut(auth);
}
