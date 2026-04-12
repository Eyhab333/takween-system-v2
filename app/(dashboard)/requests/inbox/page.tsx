// app/(dashboard)/requests/inbox/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import useClaimsRole from "@/hooks/use-claims-role";
import type { InternalRequest } from "@/lib/internal-requests/types";
import { mapDataToInternalRequest } from "@/lib/internal-requests/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getRecipientByEmail } from "@/lib/internal-requests/recipients";


import RequestsFiltersBar from "@/components/requests/RequestsFilters";
import {
  applyRequestFilters,
  defaultRequestsFilters,
} from "@/lib/internal-requests/filters";

import RequestsSearchBar from "@/components/requests/RequestsSearchBar";
import { searchRequestsByTitleOnly } from "@/lib/internal-requests/search";


type RecipientKey = string;

export default function InboxPage() {
  const router = useRouter();
  const { uid, loading } = useClaimsRole();

  const [myRecipientKey, setMyRecipientKey] = useState<RecipientKey | null>(null);

  const [primary, setPrimary] = useState<InternalRequest[]>([]);
  const [cc, setCc] = useState<InternalRequest[]>([]);

  const [subscribedPrimary, setSubscribedPrimary] = useState(false);
  const [subscribedCc, setSubscribedCc] = useState(false);

  const [errMsg, setErrMsg] = useState<string | null>(null);


  // 1) هات requestRecipientKey من users/{uid}
  useEffect(() => {
    if (loading) return;

    if (!uid) {
      setErrMsg("سجّل الدخول أولاً");
      setMyRecipientKey(null);
      // ✅ خلّص التحميل عشان ما يعلق
      setSubscribedPrimary(true);
      setSubscribedCc(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setErrMsg(null);
        const snap = await getDoc(doc(db, "users", uid));
        const key = (snap.exists() ? (snap.data() as any)?.requestRecipientKey : null) as
          | RecipientKey
          | null;

        if (!cancelled) {
          setMyRecipientKey(key || null);

          // لو المستخدم مش مربوط بجهة، ما نعلّقش
          if (!key) {
            setSubscribedPrimary(true);
            setSubscribedCc(true);
            setPrimary([]);
            setCc([]);
          }
        }
      } catch (e: any) {
        console.error("load myRecipientKey error:", e);
        if (!cancelled) {
          setErrMsg(e?.message || "تعذر تحميل بيانات الجهة للمستخدم");
          setMyRecipientKey(null);
          setSubscribedPrimary(true);
          setSubscribedCc(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, uid]);

  // 2) subscriptions للوارد (أساسي + نسخة) بالـ keys
  useEffect(() => {
    if (loading) return;

    // لو مفيش uid أو مفيش recipientKey، ما تعملش snapshot
    if (!uid || !myRecipientKey) return;

    let unsub1: Unsubscribe | null = null;
    let unsub2: Unsubscribe | null = null;

    setSubscribedPrimary(false);
    setSubscribedCc(false);
    setErrMsg(null);

    // ✅ الوارد الأساسي
    const q1 = query(
      collection(db, "internalRequests"),
      where("currentAssigneeKey", "==", myRecipientKey),
      where("archived", "==", false),
      orderBy("createdAt", "desc")
    );

    unsub1 = onSnapshot(
      q1,
      (snap) => {
        const list: InternalRequest[] = [];
        snap.forEach((d) => list.push(mapDataToInternalRequest(d.id, d.data())));
        setPrimary(list);
        setSubscribedPrimary(true);
      },
      (err) => {
        console.error("primary inbox snapshot error:", err);
        setErrMsg(err?.message || "تعذر تحميل الوارد الأساسي");
        setSubscribedPrimary(true);
      }
    );

    // ✅ نسخة للإطلاع (cc)
    const q2 = query(
      collection(db, "internalRequests"),
      where("ccRecipientKeys", "array-contains", myRecipientKey),
      where("archived", "==", false),
      orderBy("createdAt", "desc")
    );

    unsub2 = onSnapshot(
      q2,
      (snap) => {
        const list: InternalRequest[] = [];
        snap.forEach((d) => list.push(mapDataToInternalRequest(d.id, d.data())));
        setCc(list);
        setSubscribedCc(true);
      },
      (err) => {
        console.error("cc inbox snapshot error:", err);
        setErrMsg(err?.message || "تعذر تحميل النسخ (CC)");
        setSubscribedCc(true);
      }
    );

    return () => {
      unsub1?.();
      unsub2?.();
    };
  }, [loading, uid, myRecipientKey]);

  const items = useMemo(() => {
  // ✅ دمج بدون تكرار + ترتيب حسب createdAt
  const map = new Map<string, InternalRequest>();
  for (const r of primary) map.set(r.id, r);
  for (const r of cc) if (!map.has(r.id)) map.set(r.id, r);

  let arr = Array.from(map.values());

  // ✅ إخفاء الطلبات الملغية من وارد المدير التنفيذي فقط
  if (myRecipientKey === "ceo") {
    arr = arr.filter((r) => r.status !== "cancelled");
  }

  arr.sort((a, b) => {
    const ta = a.createdAt ? a.createdAt.getTime() : 0;
    const tb = b.createdAt ? b.createdAt.getTime() : 0;
    return tb - ta;
  });

  return arr;
}, [primary, cc, myRecipientKey]);

  const subscribed = subscribedPrimary && subscribedCc;

  const [filters, setFilters] = useState(defaultRequestsFilters);
  const [q, setQ] = useState("");

  const filteredItems = useMemo(() => {
    const afterFilters = applyRequestFilters(items, filters, {
      mode: "inbox",
      myRecipientKey,
    });

    return searchRequestsByTitleOnly(afterFilters, q);
  }, [items, filters, myRecipientKey, q]);

  const hasActiveFilters =
    JSON.stringify(filters) !== JSON.stringify(defaultRequestsFilters);





  if (loading || !subscribed) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        جارٍ تحميل الوارد…
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>الوارد</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="text-sm text-destructive">{errMsg}</div>
            <Button variant="outline" onClick={() => location.reload()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // لو المستخدم مش مربوط بجهة
  if (!myRecipientKey) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>الوارد</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              حسابك غير مربوط بجهة (requestRecipientKey) — راجع إعدادات المستخدم.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>الوارد</CardTitle>
        </CardHeader>
        <div className="px-6 pb-4">
          <RequestsSearchBar value={q} onChange={setQ} />
        </div>
        <div className="px-6 pb-4"><RequestsFiltersBar mode="inbox" value={filters} onChange={setFilters} /></div>

        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="text-sm text-muted-foreground p-6 rounded-md grid gap-4">
              <div>
                {hasActiveFilters
                  ? "لا توجد نتائج مطابقة للفلاتر الحالية."
                  : "لا توجد طلبات واردة حاليًا."}
              </div>

              {hasActiveFilters && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters(defaultRequestsFilters)}
                  >
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-right">رقم الطلب</th>
                    <th className="py-2 text-right">العنوان</th>
                    <th className="py-2 text-right">الحالة</th>
                    <th className="py-2 text-right">وارد كـ</th>
                    <th className="py-2 text-right">آخر حركة</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((r) => {
                    const lastAction =
                      r.actions && r.actions.length > 0
                        ? r.actions[r.actions.length - 1]
                        : null;

                    const isCcOnly =
                      (r as any)?.currentAssigneeKey !== myRecipientKey &&
                      Array.isArray((r as any)?.ccRecipientKeys) &&
                      (r as any).ccRecipientKeys.includes(myRecipientKey);
                    const creator =
                      getRecipientByEmail((r as any).createdByEmail)?.label ||
                      (r as any).createdByEmail ||
                      "—";

                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 align-top font-mono">
                          {(r as any).requestNumber || "—"}
                        </td>

                        <td className="py-2 align-top font-medium">
                          {r.title || "—"}
                          <div className="text-xs text-muted-foreground mt-1">
                            منشئ الطلب: {creator}
                          </div>
                        </td>



                        <td className="py-2 align-top">
                          <StatusBadge status={r.status} />
                        </td>

                        <td className="py-2 align-top text-xs">
                          {isCcOnly ? (
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                              نسخة
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                              أساسي
                            </span>
                          )}
                        </td>

                        <td className="py-2 align-top text-xs text-muted-foreground">
                          {lastAction ? (
                            <>
                              {renderActionLabel(lastAction.actionType)}{" "}
                              {lastAction.at
                                ? `— ${lastAction.at.toLocaleString("ar-SA")}`
                                : ""}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="py-2 align-top text-left">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/requests/${r.id}`)}
                          >
                            فتح
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: InternalRequest["status"] }) {
  const labelMap: Record<string, string> = {
    open: "مفتوح",
    in_progress: "قيد المعالجة",
    approved: "معتمد",
    rejected: "مرفوض",
    closed: "مغلق",
    cancelled: "ملغي",
  };
  const label = labelMap[status] ?? status;

  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {label}
    </span>
  );
}

function renderActionLabel(actionType: any) {
  const map: Record<string, string> = {
    submitted: "تم إنشاء الطلب",
    forwarded: "تمت إحالة الطلب",
    approved: "تم اعتماد الطلب",
    rejected: "تم رفض الطلب",
    comment: "تعليق على الطلب",
    closed: "تم إغلاق الطلب",
    generated_pdf: "تم توليد PDF",
  };
  return map[actionType] ?? String(actionType);
}
