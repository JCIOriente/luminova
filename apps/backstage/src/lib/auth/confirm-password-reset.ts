import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function verifyResetCode(oobCode: string): Promise<string> {
  const { auth } = getFirebase();
  return verifyPasswordResetCode(auth, oobCode);
}

export async function confirmReset(oobCode: string, newPassword: string): Promise<void> {
  const { auth } = getFirebase();
  await confirmPasswordReset(auth, oobCode, newPassword);
}
