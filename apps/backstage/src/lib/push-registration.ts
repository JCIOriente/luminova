import {
  requestPushToken,
  revokePushToken,
  onForegroundMessage,
} from "@luminova/firebase/messaging";
import { FcmTokenRepository } from "../features/notifications/repositories/fcm-token-repository";
import { readStorage, writeStorage, removeStorage } from "./safe-storage";

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
  await new FcmTokenRepository(uid).add(token);
  // Cache the token so the logout flow can call disablePush without re-deriving it.
  writeStorage(TOKEN_KEY, token);
  return token;
}

/** Remove a device token (e.g. on logout). Drops both the Firestore token doc AND the
 *  physical FCM subscription (revokePushToken), so a signed-out device stops receiving
 *  push — deleting only the doc would leave the browser subscription alive. */
export async function disablePush(uid: string, token: string): Promise<void> {
  await new FcmTokenRepository(uid).remove(token);
  await revokePushToken();
  removeStorage(TOKEN_KEY);
}

/** The last token persisted by enablePush on this device, if any. */
export function storedPushToken(): string | null {
  return readStorage(TOKEN_KEY);
}

/** Wire foreground messages to a handler (e.g. a toast). Returns an unsubscribe fn. */
export async function listenForeground(
  handler: (title: string, body: string) => void,
): Promise<() => void> {
  return onForegroundMessage((payload) => {
    handler(payload.notification?.title ?? "JCI Oriente", payload.notification?.body ?? "");
  });
}
