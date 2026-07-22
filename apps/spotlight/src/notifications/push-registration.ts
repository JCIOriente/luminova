import { getFirestoreLite } from "@luminova/firebase/lite";
import { doc, setDoc, serverTimestamp } from "firebase/firestore/lite";
import { requestPushToken } from "@luminova/firebase/messaging";

// Static config the FCM background SW (firebase-messaging-sw.js) can't read from
// import.meta.env — passed through the registration query string instead.
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

/** Opt in: register the FCM SW, get a token, persist it as an anonymous pushTokens doc.
 *  Returns the token or null (unsupported / denied). This module statically imports
 *  firebase/messaging, so it MUST only ever be reached via dynamic import() from the
 *  soft prompt — never from the eager shell. */
export async function enablePush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${swConfigQuery()}`,
  );
  const token = await requestPushToken(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "", reg);
  if (!token) return null;
  await setDoc(doc(getFirestoreLite(), "pushTokens", token), { createdAt: serverTimestamp() });
  return token;
}
