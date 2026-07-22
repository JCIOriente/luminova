/* Firebase Cloud Messaging background handler. Separate from the workbox precache
   SW (sw.js) — background push + notification clicks only, must NOT claim page control.
   Config comes from the registration query string. */
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");
const params = new URL(self.location).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification?.title ?? "JCI Oriente", {
    body: payload.notification?.body ?? "",
    icon: "/pwa-192x192.png",
    data: { url: payload.data?.url ?? "/" },
  });
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const hit = wins.find((w) => w.url === url);
      return hit ? hit.focus() : clients.openWindow(url);
    }),
  );
});
