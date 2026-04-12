/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const messaging = firebase.messaging();

// إشعار بالخلفية
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "إشعار جديد";
  const body = payload?.notification?.body || "";
  const link = payload?.data?.link || "/requests/inbox";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    data: { link },
  });
});

// عند الضغط على الإشعار
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || "/requests/inbox";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const origin = self.location.origin;
    const url = link.startsWith("http") ? link : origin + link;

    for (const c of allClients) {
      if (c.url.startsWith(origin)) {
        await c.focus();
        c.navigate(url);
        return;
      }
    }
    await clients.openWindow(url);
  })());
});