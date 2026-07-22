import { getDb } from "@luminova/firebase/db";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import {
  requestPushToken,
  revokePushToken,
  onForegroundMessage,
} from "@luminova/firebase/messaging";

// Reached ONLY via a dynamic import() from the opt-in prompt, so the static
// `@luminova/firebase/messaging` import here (and firebase/messaging behind it)
// stays out of the login-path eager graph.

const TOKEN_KEY = "backstage.push.token";

function swConfigQuery(): string {
  const e = import.meta.env;
  return new URLSearchParams({
    apiKey: e.VITE_FIREBASE_API_KEY ?? "",
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: e.VITE_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: e.VITE_FIREBASE_APP_ID ?? "",
  }).toString();
}

async function registerFcmSw(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${swConfigQuery()}`);
}

/** Opt in: register the FCM SW, get a token, persist it under the member's uid.
 *  Returns the token, or null if unsupported/denied. */
export async function enablePush(uid: string): Promise<string | null> {
  const reg = await registerFcmSw();
  const token = await requestPushToken(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "", reg);
  if (!token) return null;
  await setDoc(doc(getDb(), `members/${uid}/fcmTokens/${token}`), { createdAt: serverTimestamp() });
  // Cache the token so the logout flow can call disablePush without re-deriving it.
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage can throw in private-mode/quota edge cases — a non-fatal cache miss.
  }
  return token;
}

/** Remove a device token (e.g. on logout). Drops both the Firestore token doc AND the
 *  physical FCM subscription (revokePushToken), so a signed-out device stops receiving
 *  push — deleting only the doc would leave the browser subscription alive. */
export async function disablePush(uid: string, token: string): Promise<void> {
  await deleteDoc(doc(getDb(), `members/${uid}/fcmTokens/${token}`));
  await revokePushToken();
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore — see enablePush.
  }
}

/** The last token persisted by enablePush on this device, if any. */
export function storedPushToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Wire foreground messages to a handler (e.g. a toast). Returns an unsubscribe fn. */
export async function listenForeground(
  handler: (title: string, body: string) => void,
): Promise<() => void> {
  return onForegroundMessage((payload) => {
    handler(payload.notification?.title ?? "JCI Oriente", payload.notification?.body ?? "");
  });
}
