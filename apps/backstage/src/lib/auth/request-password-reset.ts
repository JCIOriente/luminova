import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function requestPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebase();
  await sendPasswordResetEmail(auth, email);
}
