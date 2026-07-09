/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC09sh8e8NuP3uidzUOQauE2C2UjgAKWMo",
  authDomain: "takween-almaryfa.firebaseapp.com",
  projectId: "takween-almaryfa",
  messagingSenderId: "987008445295",
  appId: "1:987008445295:web:df8960ee8ce3f47421d69a",
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