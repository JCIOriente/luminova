/* Firebase Cloud Messaging background handler. Kept separate from the workbox
   precache SW (sw.js) — this one only handles background push + notification clicks
   and must NOT claim page control. Config is passed via the registration query string
   (a static SW can't read import.meta.env). */
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
  const title = payload.notification?.title ?? "JCI Oriente";
  self.registration.showNotification(title, {
    body: payload.notification?.body ?? "",
    icon: "/pwa-192x192.png",
    data: { url: payload.data?.url ?? "/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  // WindowClient.url is absolute; resolve the (possibly relative) target so the
  // focus-existing-tab match works instead of always opening a duplicate.
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const hit = wins.find((w) => w.url === target);
      if (hit) return hit.focus();
      return clients.openWindow(target);
    }),
  );
});
