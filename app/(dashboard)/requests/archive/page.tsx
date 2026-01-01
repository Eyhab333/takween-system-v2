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

import RequestsSearchBar from "@/components/requests/RequestsSearchBar";
import { searchRequestsByTitleOnly } from "@/lib/internal-requests/search";
import {
  applyRequestFilters,
  defaultRequestsFilters,
} from "@/lib/internal-requests/filters";
import RequestsFiltersBar from "@/components/requests/RequestsFilters";

type RecipientKey = string;

export default function ArchivePage() {
  const router = useRouter();
  const { uid, loading } = useClaimsRole();

  const [myRecipientKey, setMyRecipientKey] = useState<RecipientKey | null>(null);
  const [myRecipientLoaded, setMyRecipientLoaded] = useState(false);

  const [created, setCreated] = useState<InternalRequest[]>([]);
  const [assigned, setAssigned] = useState<InternalRequest[]>([]);
  const [cc, setCc] = useState<InternalRequest[]>([]);

  const [subCreated, setSubCreated] = useState(false);
  const [subAssigned, setSubAssigned] = useState(false);
  const [subCc, setSubCc] = useState(false);

  const [qText, setQText] = useState("");
  const [filters, setFilters] = useState(defaultRequestsFilters);

  // 1) load myRecipientKey from users/{uid}
  useEffect(() => {
    if (loading) return;

    if (!uid) {
      setMyRecipientKey(null);
      setMyRecipientLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const key = (snap.exists() ? (snap.data() as any)?.requestRecipientKey : null) as
          | RecipientKey
          | null;

        if (!cancelled) setMyRecipientKey(key || null);
      } catch {
        if (!cancelled) setMyRecipientKey(null);
      } finally {
        if (!cancelled) setMyRecipientLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, uid]);

  // 2) subscribe createdByUid archived=true
  useEffect(() => {
    if (loading) return;
    if (!uid) return;

    setSubCreated(false);

    const q1 = query(
      collection(db, "internalRequests"),
      where("createdByUid", "==", uid),
      where("archived", "==", true),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q1,
      (snap) => {
        const list: InternalRequest[] = [];
        snap.forEach((d) => list.push(mapDataToInternalRequest(d.id, d.data())));
        setCreated(list);
        setSubCreated(true);
      },
      () => setSubCreated(true)
    );

    return () => unsub();
  }, [loading, uid]);

  // 3) subscribe assigned + cc archived=true (بالـ key)
  useEffect(() => {
    if (loading) return;
    if (!uid) return;

    // لو مفيش key خلّص الاشتراكات بدون تعليق
    if (!myRecipientLoaded) return;
    if (!myRecipientKey) {
      setAssigned([]);
      setCc([]);
      setSubAssigned(true);
      setSubCc(true);
      return;
    }

    let unsub2: Unsubscribe | null = null;
    let unsub3: Unsubscribe | null = null;

    setSubAssigned(false);
    setSubCc(false);

    const q2 = query(
      collection(db, "internalRequests"),
      where("currentAssigneeKey", "==", myRecipientKey),
      where("archived", "==", true),
      orderBy("createdAt", "desc")
    );

    unsub2 = onSnapshot(
      q2,
      (snap) => {
        const list: InternalRequest[] = [];
        snap.forEach((d) => list.push(mapDataToInternalRequest(d.id, d.data())));
        setAssigned(list);
        setSubAssigned(true);
      },
      () => setSubAssigned(true)
    );

    const q3 = query(
      collection(db, "internalRequests"),
      where("ccRecipientKeys", "array-contains", myRecipientKey),
      where("archived", "==", true),
      orderBy("createdAt", "desc")
    );

    unsub3 = onSnapshot(
      q3,
      (snap) => {
        const list: InternalRequest[] = [];
        snap.forEach((d) => list.push(mapDataToInternalRequest(d.id, d.data())));
        setCc(list);
        setSubCc(true);
      },
      () => setSubCc(true)
    );

    return () => {
      unsub2?.();
      unsub3?.();
    };
  }, [loading, uid, myRecipientLoaded, myRecipientKey]);

  const subscribed = subCreated && subAssigned && subCc;

  const items = useMemo(() => {
    // merge بدون تكرار + ترتيب
    const m = new Map<string, InternalRequest>();
    for (const r of created) m.set(r.id, r);
    for (const r of assigned) if (!m.has(r.id)) m.set(r.id, r);
    for (const r of cc) if (!m.has(r.id)) m.set(r.id, r);

    const arr = Array.from(m.values());
    arr.sort((a, b) => {
      const ta = a.createdAt ? a.createdAt.getTime() : 0;
      const tb = b.createdAt ? b.createdAt.getTime() : 0;
      return tb - ta;
    });
    return arr;
  }, [created, assigned, cc]);

  const filteredItems = useMemo(() => {
    const afterFilters = applyRequestFilters(items, filters, { mode: "archive", myRecipientKey });
    return searchRequestsByTitleOnly(afterFilters, qText);
  }, [items, filters, qText, myRecipientKey]);

  if (loading || !subscribed) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        جارٍ تحميل الأرشيف…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>الأرشيف</CardTitle>
        </CardHeader>

        <div className="px-6 pb-4">
          <RequestsSearchBar value={qText} onChange={setQText} />
        </div>

        <div className="px-6 pb-4">
          <RequestsFiltersBar mode="archive" value={filters} onChange={setFilters} />
        </div>

        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">لا توجد طلبات مؤرشفة.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-right">رقم</th>
                    <th className="py-2 text-right">العنوان</th>
                    <th className="py-2 text-right">الحالة</th>
                    <th className="py-2 text-right">تاريخ</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((r, idx) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 align-top">{idx + 1}</td>
                      <td className="py-2 align-top font-medium">{r.title || "—"}</td>
                      <td className="py-2 align-top">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2 align-top text-xs text-muted-foreground">
                        {r.updatedAt
                          ? r.updatedAt.toLocaleString("ar-SA")
                          : r.createdAt
                          ? r.createdAt.toLocaleString("ar-SA")
                          : "—"}
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
                  ))}
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
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {labelMap[status] ?? status}
    </span>
  );
}
