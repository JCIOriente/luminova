import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";
import { ensureApp } from "./app-core.js";

/** True only in a browser whose engine supports FCM web push (guards SSR + Safari/iOS
 *  quirks). Never throws — isSupported() rejections resolve to false. */
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return isSupported().catch(() => false);
}

/** Request a device registration token. Returns null when push is unsupported or the
 *  user denies permission. `swReg` is the app-registered firebase-messaging-sw.js
 *  registration (FCM background handler). */
export async function requestPushToken(
  vapidKey: string,
  swReg: ServiceWorkerRegistration,
): Promise<string | null> {
  if (!(await isPushSupported())) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const messaging = getMessaging(ensureApp());
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg }).catch(() => null);
}

/** Subscribe to foreground messages (OS notification is suppressed while the tab is
 *  focused). Returns an unsubscribe fn. */
export function onForegroundMessage(handler: (payload: MessagePayload) => void): () => void {
  const messaging = getMessaging(ensureApp());
  return onMessage(messaging, handler);
}
