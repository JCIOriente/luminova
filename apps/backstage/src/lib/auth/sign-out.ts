import { signOut } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  // Best-effort: drop this device's push token so a signed-out device stops
  // receiving this member's notifications. Dynamic import keeps FCM/messaging off
  // the app-shell eager graph; a failure here must never block sign-out.
  if (uid) {
    try {
      const { storedPushToken, disablePush } = await import("../push-registration");
      const token = storedPushToken();
      if (token) await disablePush(uid, token);
    } catch (err) {
      console.warn("push token cleanup on sign-out failed", err);
    }
  }
  await signOut(auth);
}
