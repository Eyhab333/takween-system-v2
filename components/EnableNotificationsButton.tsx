/*
"use client";

import { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

import { app, auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useClaimsRole from "@/hooks/use-claims-role";

export default function EnableNotificationsButton() {
  const claimsState = useClaimsRole();
  const [loading, setLoading] = useState(false);

  const enable = async () => {
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("لازم تسجّل دخول أولًا");
        return;
      }

      const supported = await isSupported();
      if (!supported) {
        toast.error("المتصفح أو الجهاز لا يدعم إشعارات الويب");
        return;
      }

      if (!("Notification" in window)) {
        toast.error("هذا المتصفح لا يدعم الإشعارات");
        return;
      }

      if (!("serviceWorker" in navigator)) {
        toast.error("Service Worker غير مدعوم في هذا المتصفح");
        return;
      }

      if (Notification.permission === "denied") {
        toast.error("الإشعارات مرفوضة من المتصفح. فعّلها من إعدادات الموقع أولًا");
        return;
      }

      const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      let permission: NotificationPermission = Notification.permission;

      if (permission === "default") {
        permission = await Notification.requestPermission();
      }

      if (permission !== "granted") {
        toast.error("تم رفض إذن الإشعارات");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        toast.error("NEXT_PUBLIC_FIREBASE_VAPID_KEY غير موجودة في env");
        return;
      }

      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: reg,
      });

      if (!token) {
        toast.error("تعذر الحصول على Token للإشعارات");
        return;
      }

      await setDoc(
        doc(db, "users", user.uid, "fcmTokens", token),
        {
          token,
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ua: navigator.userAgent,
          role: (claimsState as any)?.role ?? null,
        },
        { merge: true }
      );

      toast.success("تم تفعيل الإشعارات بنجاح ✅");
    } catch (e: any) {
      console.error("enable notifications error:", e);
      toast.error(e?.message || "حصل خطأ أثناء تفعيل الإشعارات");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" onClick={enable} disabled={loading}>
      {loading ? "جارٍ التفعيل..." : "تفعيل الإشعارات"}
    </Button>
  );
}
*/

"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

import { app, auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useClaimsRole from "@/hooks/use-claims-role";

export default function EnableNotificationsButton() {
  const claimsState = useClaimsRole();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyEnabled, setAlreadyEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          if (!cancelled) {
            setAlreadyEnabled(false);
            setChecking(false);
          }
          return;
        }

        const supported = await isSupported();
        if (!supported || !("Notification" in window)) {
          if (!cancelled) {
            setAlreadyEnabled(false);
            setChecking(false);
          }
          return;
        }

        if (Notification.permission !== "granted") {
          if (!cancelled) {
            setAlreadyEnabled(false);
            setChecking(false);
          }
          return;
        }

        if (!("serviceWorker" in navigator)) {
          if (!cancelled) {
            setAlreadyEnabled(false);
            setChecking(false);
          }
          return;
        }

        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          if (!cancelled) {
            setAlreadyEnabled(false);
            setChecking(false);
          }
          return;
        }

        const reg = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
        );

        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: reg,
        });

        if (!token) {
          if (!cancelled) {
            setAlreadyEnabled(false);
            setChecking(false);
          }
          return;
        }

        const tokenRef = doc(db, "users", user.uid, "fcmTokens", token);
        const tokenSnap = await getDoc(tokenRef);

        if (!cancelled) {
          setAlreadyEnabled(tokenSnap.exists());
          setChecking(false);
        }
      } catch (e) {
        console.warn("check notifications enabled error:", e);
        if (!cancelled) {
          setAlreadyEnabled(false);
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("لازم تسجّل دخول أولًا");
        return;
      }

      const supported = await isSupported();
      if (!supported) {
        toast.error("المتصفح أو الجهاز لا يدعم إشعارات الويب");
        return;
      }

      if (!("Notification" in window)) {
        toast.error("هذا المتصفح لا يدعم الإشعارات");
        return;
      }

      if (!("serviceWorker" in navigator)) {
        toast.error("Service Worker غير مدعوم في هذا المتصفح");
        return;
      }

      if (Notification.permission === "denied") {
        toast.error(
          "الإشعارات مرفوضة من المتصفح. فعّلها من إعدادات الموقع أولًا",
        );
        return;
      }

      const reg = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );

      let permission: NotificationPermission = Notification.permission;

      if (permission === "default") {
        const requested = await Notification.requestPermission();
        permission = requested;
      }

      if (permission !== "granted") {
        toast.error("تم رفض إذن الإشعارات");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        toast.error("NEXT_PUBLIC_FIREBASE_VAPID_KEY غير موجودة في env");
        return;
      }

      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: reg,
      });

      if (!token) {
        toast.error("تعذر الحصول على Token للإشعارات");
        return;
      }

      await setDoc(
        doc(db, "users", user.uid, "fcmTokens", token),
        {
          token,
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ua: navigator.userAgent,
          role: (claimsState as any)?.role ?? null,
        },
        { merge: true },
      );

      setAlreadyEnabled(true);
      toast.success("تم تفعيل الإشعارات بنجاح ✅");
    } catch (e: any) {
      console.error("enable notifications error:", e);
      toast.error(e?.message || "حصل خطأ أثناء تفعيل الإشعارات");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;
  if (alreadyEnabled) return null;

  return (
    <Button type="button" onClick={enable} disabled={loading}>
      {loading ? "جارٍ التفعيل..." : "تفعيل الإشعارات"}
    </Button>
  );
}
