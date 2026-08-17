"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import useClaimsRole from "@/hooks/use-claims-role";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NotificationItem = {
  id: string;
  title?: string;
  body?: string;
  link?: string;
  createdAt?: { toDate?: () => Date };
  createdAtMs?: number;
  read?: boolean;
};

type ReadFilter = "all" | "unread" | "read";
const PAGE_SIZE = 25;

function formatNotificationDate(notification: NotificationItem) {
  const date = notification.createdAt?.toDate?.()
    ?? (notification.createdAtMs ? new Date(notification.createdAtMs) : null);
  return date ? date.toLocaleString("ar-SA") : "—";
}

export default function NotificationsPage() {
  const { uid, loading } = useClaimsRole();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [filter, setFilter] = useState<ReadFilter>("all");

  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setNotifications([]);
      setLastDoc(null);
      setHasMore(false);
      setLoadingPage(false);
      return;
    }

    let cancelled = false;
    setLoadingPage(true);
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", uid, "notifications"),
            orderBy("createdAtMs", "desc"),
            limit(PAGE_SIZE),
          ),
        );
        if (cancelled) return;
        setNotifications(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (error) {
        console.error("load notifications error:", error);
        if (!cancelled) toast.error("تعذر تحميل الإشعارات");
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, uid]);

  const visibleNotifications = useMemo(
    () => notifications.filter((notification) =>
      filter === "all" ? true : filter === "read" ? !!notification.read : !notification.read,
    ),
    [filter, notifications],
  );

  async function loadMore() {
    if (!uid || !lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "notifications"),
          orderBy("createdAtMs", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE),
        ),
      );
      const additions = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      setNotifications((current) => [
        ...current,
        ...additions.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? lastDoc);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("load more notifications error:", error);
      toast.error("تعذر تحميل المزيد من الإشعارات");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleNotificationClick(notification: NotificationItem) {
    if (!uid) return;
    if (!notification.read) {
      try {
        await setDoc(doc(db, "users", uid, "notifications", notification.id), { read: true }, { merge: true });
        setNotifications((current) => current.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item,
        ));
      } catch (error) {
        console.warn("mark notification read error:", error);
      }
    }
    if (notification.link) router.push(notification.link);
  }

  async function markAllRead() {
    if (!uid || markingAllRead) return;
    setMarkingAllRead(true);
    try {
      while (true) {
        const snap = await getDocs(
          query(collection(db, "users", uid, "notifications"), where("read", "==", false), limit(400)),
        );
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((item) => batch.set(item.ref, { read: true }, { merge: true }));
        await batch.commit();
        if (snap.size < 400) break;
      }
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (error) {
      console.error("mark all notifications read error:", error);
      toast.error("تعذر تحديد الإشعارات كمقروءة");
    } finally {
      setMarkingAllRead(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl" dir="rtl">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>الإشعارات</CardTitle>
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={markingAllRead}>
            تحديد الكل كمقروء
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "unread", "read"] as const).map((value) => (
              <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
                {value === "all" ? "الكل" : value === "unread" ? "غير مقروءة" : "مقروءة"}
              </Button>
            ))}
          </div>

          {loadingPage ? (
            <div className="py-10 text-center text-sm text-muted-foreground">جارٍ تحميل الإشعارات…</div>
          ) : visibleNotifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">لا توجد إشعارات مطابقة.</div>
          ) : (
            <ul className="divide-y rounded-md border">
              {visibleNotifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full px-4 py-3 text-right text-sm transition-colors hover:bg-muted ${!notification.read ? "bg-muted/60" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{notification.title || "إشعار"}</span>
                      {!notification.read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    {notification.body && <p className="mt-1 text-xs text-muted-foreground">{notification.body}</p>}
                    <p className="mt-2 text-[11px] text-muted-foreground">{formatNotificationDate(notification)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
