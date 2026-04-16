"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";
import { toast } from "sonner";

import useClaimsRole from "@/hooks/use-claims-role";
import { db, storage } from "@/lib/firebase";
import {
  audienceLabel,
  buildUserTokens,
} from "@/lib/announcements/audience";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Announcement = {
  id: string;
  title: string;
  content?: string;
  audTokens: string[];
  createdAt?: any;
  createdByUid?: string | null;
  createdByEmail?: string | null;
  pinned?: boolean;

  hasPdf?: boolean;
  pdfPath?: string | null;
  pdfName?: string | null;
  pdfSize?: number | null;
  pdfContentType?: string | null;
};

function formatDate(value: any) {
  try {
    if (value?.toDate) {
      return value.toDate().toLocaleString("ar-SA");
    }
    if (value instanceof Date) {
      return value.toLocaleString("ar-SA");
    }
    return "—";
  } catch {
    return "—";
  }
}

function formatFileSize(size?: number | null) {
  if (!size || size <= 0) return "—";
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const { uid, role: claimsRole, loading } = useClaimsRole();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<Announcement[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"forMe" | "all">("forMe");
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfUrlCache, setPdfUrlCache] = useState<Record<string, string>>({});

  const isSuperadmin = claimsRole === "superadmin";

  useEffect(() => {
    if (!isSuperadmin && viewMode === "all") {
      setViewMode("forMe");
    }
  }, [isSuperadmin, viewMode]);

  useEffect(() => {
    if (loading || !uid) return;

    let cancelled = false;

    (async () => {
      setPageLoading(true);

      try {
        let result: Announcement[] = [];

        if (isSuperadmin && viewMode === "all") {
          const allQuery = query(
            collection(db, "announcements"),
            orderBy("createdAt", "desc"),
            limit(100),
          );

          const snap = await getDocs(allQuery);
          result = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Announcement, "id">),
          }));
        } else {
          const userSnap = await getDoc(doc(db, "users", uid));
          const userData = userSnap.exists() ? (userSnap.data() as any) : {};

          const effectiveRole =
            (typeof userData?.role === "string" && userData.role.trim()) ||
            claimsRole ||
            null;

          const tokens = buildUserTokens({
            role: effectiveRole,
            unit: userData?.unit ?? null,
            schoolKey: userData?.schoolKey ?? null,
            schoolType: userData?.schoolType ?? null,
            tags: Array.isArray(userData?.tags) ? userData.tags : [],
          }).slice(0, 10);

          const targetedQuery = query(
            collection(db, "announcements"),
            where("audTokens", "array-contains-any", tokens),
            orderBy("createdAt", "desc"),
            limit(100),
          );

          const snap = await getDocs(targetedQuery);
          result = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Announcement, "id">),
          }));
        }

        if (!cancelled) {
          setItems(result);
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          toast.error(e?.message || "تعذر تحميل التعميمات");
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, claimsRole, loading, isSuperadmin, viewMode]);

  async function resolvePdfUrl(ann: Announcement) {
    if (!ann.pdfPath) {
      throw new Error("لا يوجد ملف PDF لهذا التعميم");
    }

    if (pdfUrlCache[ann.id]) {
      return pdfUrlCache[ann.id];
    }

    const url = await getDownloadURL(ref(storage, ann.pdfPath));
    setPdfUrlCache((prev) => ({ ...prev, [ann.id]: url }));
    return url;
  }

  async function handleOpenPdf(ann: Announcement) {
    try {
      setPdfBusyId(ann.id);
      const url = await resolvePdfUrl(ann);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذر فتح ملف الـ PDF");
    } finally {
      setPdfBusyId(null);
    }
  }

  async function handleDownloadPdf(ann: Announcement) {
    try {
      setPdfBusyId(ann.id);
      const url = await resolvePdfUrl(ann);

      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = ann.pdfName || "announcement.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذر تنزيل ملف الـ PDF");
    } finally {
      setPdfBusyId(null);
    }
  }

  function handleDelete(ann: Announcement) {
    const ok = window.confirm("هل تريد حذف هذا التعميم؟");
    if (!ok) return;

    startTransition(async () => {
      try {
        if (ann.pdfPath) {
          try {
            await deleteObject(ref(storage, ann.pdfPath));
          } catch (e) {
            console.warn("failed to delete announcement pdf:", e);
          }
        }

        await deleteDoc(doc(db, "announcements", ann.id));
        setItems((prev) => prev.filter((x) => x.id !== ann.id));
        toast.success("تم حذف التعميم");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "تعذر حذف التعميم");
      }
    });
  }

  if (loading) return null;

  return (
    <div className="mx-auto max-w-5xl grid gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>التعميمات</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              تعرض لك هذه الصفحة التعميمات الموجهة إليك.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSuperadmin ? (
              <>
                <Button
                  type="button"
                  variant={viewMode === "forMe" ? "default" : "outline"}
                  onClick={() => setViewMode("forMe")}
                >
                  الموجهة لي
                </Button>

                <Button
                  type="button"
                  variant={viewMode === "all" ? "default" : "outline"}
                  onClick={() => setViewMode("all")}
                >
                  كل التعميمات
                </Button>

                <Button
                  type="button"
                  onClick={() => router.push("/announcements/new")}
                >
                  إنشاء تعميم
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          {pageLoading ? (
            <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              لا توجد تعميمات مطابقة حاليًا.
            </div>
          ) : (
            <div className="grid gap-4">
              {items.map((ann) => (
                <div key={ann.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold break-words">
                        {ann.title}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(ann.createdAt)}
                        {ann.createdByEmail ? ` • ${ann.createdByEmail}` : ""}
                      </div>
                    </div>

                    {isSuperadmin ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pending}
                          onClick={() => handleDelete(ann)}
                        >
                          حذف
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <Separator className="my-4" />

                  <div className="text-sm whitespace-pre-wrap leading-7">
                    {ann.content?.trim() ? ann.content : "—"}
                  </div>

                  {ann.hasPdf && ann.pdfPath ? (
                    <div className="mt-4 rounded-lg border p-3">
                      <div className="text-sm font-medium">مرفق PDF</div>

                      <div className="mt-1 text-xs text-muted-foreground break-all">
                        {ann.pdfName || "ملف PDF"} • {formatFileSize(ann.pdfSize)}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pdfBusyId === ann.id}
                          onClick={() => handleOpenPdf(ann)}
                        >
                          {pdfBusyId === ann.id ? "جارٍ الفتح..." : "فتح المرفق"}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pdfBusyId === ann.id}
                          onClick={() => handleDownloadPdf(ann)}
                        >
                          {pdfBusyId === ann.id ? "جارٍ التحميل..." : "تحميل المرفق"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {isSuperadmin && ann.audTokens?.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {ann.audTokens.map((token) => (
                        <span
                          key={token}
                          className="inline-flex items-center rounded-full border px-3 py-1 text-xs"
                        >
                          {audienceLabel(token)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}