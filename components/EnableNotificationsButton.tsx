"use client";

import { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

import { app, auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// اختياري: لو حابب تمنع الزر لغير المصرّح لهم
import useClaimsRole from "@/hooks/use-claims-role";

export default function EnableNotificationsButton() {
  const claimsState = useClaimsRole(); // اختياري
  const [loading, setLoading] = useState(false);

  const enable = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("لازم تسجّل دخول الأول");
        return;
      }

      const supported = await isSupported();
      if (!supported) {
        toast.error("المتصفح/الجهاز لا يدعم إشعارات الويب");
        return;
      }

      if (!("serviceWorker" in navigator)) {
        toast.error("Service Worker غير مدعوم");
        return;
      }

      const reg = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
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
      // خزّن التوكن تحت المستخدم (يدعم تعدد الأجهزة/المتصفحات)
      await setDoc(
        doc(db, "users", user.uid, "fcmTokens", token),
        {
          token,
          createdAt: serverTimestamp(),
          ua: navigator.userAgent,
          role: (claimsState as any)?.role ?? null, // اختياري
        },
        { merge: true },
      );

      toast.success("تم تفعيل الإشعارات ✅");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "حصل خطأ أثناء تفعيل الإشعارات");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={enable} disabled={loading}>
      {loading ? "..." : "تفعيل الإشعارات"}
    </Button>
  );
}
