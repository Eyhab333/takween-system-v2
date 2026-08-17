"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import useClaimsRole from "@/hooks/use-claims-role";
import { app, db } from "@/lib/firebase";

import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  setDoc,
  where,
} from "firebase/firestore";

import { getMessaging, isSupported, onMessage } from "firebase/messaging";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type NotificationItem = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  link?: string;
  createdAt?: any;
  createdAtMs?: number;
  read?: boolean;
};

export function NotificationBell() {
  const { uid, loading } = useClaimsRole();
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  // 1) آخر 10 إشعارات للعرض
  useEffect(() => {
    if (loading || !uid) return;

    const qLast = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAtMs", "desc"),
      limit(10)
    );

    const unsub = onSnapshot(
      qLast,
      (snap) => {
        const list: NotificationItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setNotifs(list);
      },
      (err) => {
        console.error("notifications(last10) listener error:", err);
        toast.error("تعذر تحميل الإشعارات");
      }
    );

    return () => unsub();
  }, [loading, uid]);

  // 2) عدّاد غير المقروء (بدون limit)
  useEffect(() => {
    if (loading || !uid) return;

    const qUnread = query(
      collection(db, "users", uid, "notifications"),
      where("read", "==", false)
    );

    const unsub = onSnapshot(
      qUnread,
      (snap) => {
        setUnreadCount(snap.size);
      },
      (err) => {
        console.error("notifications(unread) listener error:", err);
      }
    );

    return () => unsub();
  }, [loading, uid]);

  // 3) Toast عند وصول FCM والصفحة مفتوحة (Foreground)
  useEffect(() => {
    if (loading || !uid) return;

    let unsub: undefined | (() => void);

    (async () => {
      const ok = await isSupported();
      if (!ok) return;

      const messaging = getMessaging(app);
      unsub = onMessage(messaging, (payload) => {
        const title = payload?.notification?.title || "إشعار جديد";
        const body = payload?.notification?.body || "";
        const link = (payload as any)?.data?.link as string | undefined;

        toast(title, {
          description: body,
          action: link ? { label: "فتح", onClick: () => router.push(link) } : undefined,
        });
        // لا تزود unread يدويًا — listeners في Firestore هي اللي هتحدّثه
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [loading, uid, router]);

  // 4) Badge على أيقونة الـ PWA (متاح غالبًا على Android/Chrome)
  useEffect(() => {
    // @ts-ignore
    if (navigator.setAppBadge) {
      // @ts-ignore
      navigator.setAppBadge(unreadCount);
    }
    // @ts-ignore
    if (unreadCount === 0 && navigator.clearAppBadge) {
      // @ts-ignore
      navigator.clearAppBadge();
    }
  }, [unreadCount]);

  if (loading || !uid) return null;

  async function handleClickNotification(n: NotificationItem) {
    try {
      if (!n.read) {
        const refDoc = doc(db, "users", uid!, "notifications", n.id);
        await setDoc(refDoc, { read: true }, { merge: true });
      }
    } catch (e) {
      console.warn("mark notif read error", e);
    }

    if (n.link) {
      router.push(n.link);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background hover:bg-muted"
          aria-label="الإشعارات"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -start-1 min-w-[1.25rem] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-[1.1]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-semibold">الإشعارات</span>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {unreadCount} غير مقروءة
            </span>
          )}
        </div>

        <div className="max-h-80 overflow-auto">
          {notifs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              لا توجد إشعارات
            </div>
          ) : (
            <ul className="divide-y">
              {notifs.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClickNotification(n)}
                    className={`w-full px-4 py-3 text-right text-sm flex flex-col gap-1 hover:bg-muted ${
                      !n.read ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {n.title || "إشعار"}
                      </span>
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                      )}
                    </div>

                    {n.body && (
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </span>
                    )}

                    <span className="text-[11px] text-muted-foreground">
                      {n.createdAt?.toDate
                        ? n.createdAt.toDate().toLocaleString("ar-SA")
                        : n.createdAtMs
                        ? new Date(n.createdAtMs).toLocaleString("ar-SA")
                        : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t px-4 py-2 text-xs flex items-center justify-between">
          <span className="text-muted-foreground">تظهر آخر ١٠ إشعارات</span>
          <Button asChild variant="link" size="sm" className="px-0 h-auto text-xs">
            <Link href="/notifications">عرض كل الإشعارات</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
