import {
  deleteToken,
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
  // A token fetch can fail transiently (network, SW not yet active). null is the
  // caller's "no token" signal — a non-error UX outcome — but log so a persistent
  // failure is diagnosable rather than silent (guardrail: no silent catch).
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg }).catch((err) => {
    console.warn("FCM getToken failed", err);
    return null;
  });
}

/** Delete the device's current FCM token (kills the physical push subscription, not just
 *  the Firestore token doc). No-op when push is unsupported; never throws — a cleanup
 *  failure must not block sign-out, but it is logged (guardrail: no silent catch). */
export async function revokePushToken(): Promise<void> {
  if (!(await isPushSupported())) return;
  try {
    await deleteToken(getMessaging(ensureApp()));
  } catch (err) {
    console.warn("FCM deleteToken failed", err);
  }
}

/** Subscribe to foreground messages (OS notification is suppressed while the tab is
 *  focused). Resolves to an unsubscribe fn — a no-op when push is unsupported, so a
 *  caller never trips getMessaging()'s unsupported-browser rejection (symmetric with
 *  requestPushToken's guard). */
export async function onForegroundMessage(
  handler: (payload: MessagePayload) => void,
): Promise<() => void> {
  if (!(await isPushSupported())) return () => {};
  const messaging = getMessaging(ensureApp());
  return onMessage(messaging, handler);
}
