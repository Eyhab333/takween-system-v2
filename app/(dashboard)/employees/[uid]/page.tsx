/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  orderBy,
  query,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import useClaimsRole, { Role } from "@/hooks/use-claims-role";
// لو ما عندك RoleGate، تقدر تشيل استخدامه أدناه أو تعمل Gate بسيط محلياً
import RoleGate from "@/components/auth/RoleGate";
import { where, limit as qlimit } from "firebase/firestore";

type UserDoc = {
  uid: string;
  name?: string;
  email?: string;
  department?: string;
  position?: string;
  role?: string;
  personalInfo?: { phone?: string; nationalId?: string };
};

type Certificate = { id: string; title?: string; fileUrl?: string; date?: any };
type Evaluation = { id: string; year?: number; score?: number; notes?: string };

const HR_ROLES: Role[] = ["hr", "chairman", "ceo", "admin", "superadmin"];

export default function EmployeeProfilePage() {
  // uid المستهدف من الراوت: /employees/[uid]
  const params = useParams<{ uid: string }>();
  const targetUid = params.uid;

  const router = useRouter();

  // مطالعة الدور/المستخدم الحالي
  const { role, uid: myUid, loading: claimsLoading } = useClaimsRole();

  // حالة تحميل بيانات الصفحة
  const [dataLoading, setDataLoading] = useState(true);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [pending, startTransition] = useTransition();
  const [myAnns, setMyAnns] = useState<Ann[]>([]);

  type Ann = {
    id: string;
    title: string;
    content?: string;
    createdAt?: any;
    audTokens: string[];
  };

  // حماية: الموظف العادي لا يفتح غير ملفه فقط
  useEffect(() => {
    if (claimsLoading) return;
    const isHrOrAbove = role ? HR_ROLES.includes(role) : false;
    if (!isHrOrAbove && myUid && myUid !== targetUid) {
      router.replace(`/employees/${myUid}`);
    }
  }, [claimsLoading, role, myUid, targetUid, router]);

  // تحميل بيانات الملف (بعد تحقق الصلاحيات)
  useEffect(() => {
    if (claimsLoading) return;

    let cancelled = false;
    async function load() {
      try {
        setDataLoading(true);

        // وثيقة الموظف
        const userRef = doc(db, "users", targetUid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          toast.error("الموظف غير موجود");
          router.replace("/employees");
          return;
        }
        if (cancelled) return;
        setUser({ uid: targetUid, ...(snap.data() as any) });

        try {
          // كوّن توكنات هذا الموظف من وثيقته (مش من حسابك)
          const tokens = buildUserTokens({
            unit: (snap.data() as any)?.unit ?? null,
            schoolKey: (snap.data() as any)?.schoolKey ?? null,
            schoolType: (snap.data() as any)?.schoolType ?? null,
            tags: Array.isArray((snap.data() as any)?.tags)
              ? (snap.data() as any)?.tags
              : [],
          }).slice(0, 10);

          const qy = query(
            collection(db, "announcements"),
            where("audTokens", "array-contains-any", tokens),
            orderBy("createdAt", "desc"),
            qlimit(20)
          );
          const annSnap = await getDocs(qy);
          if (cancelled) return;
          setMyAnns(
            annSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          );
        } catch (e) {
          console.warn("announcements load error", e);
        }

        // الشهادات
        const certQ = query(
          collection(db, "users", targetUid, "certificates"),
          orderBy("date", "desc")
        );
        const certSnap = await getDocs(certQ);
        if (cancelled) return;
        setCerts(
          certSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        );

        // التقييمات
        const evalQ = query(
          collection(db, "users", targetUid, "evaluations"),
          orderBy("year", "desc")
        );
        const evalSnap = await getDocs(evalQ);
        if (cancelled) return;
        setEvals(
          evalSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        );
      } catch (e) {
        console.error(e);
        toast.error("تعذر تحميل الملف");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [claimsLoading, targetUid, router]);

  // ========== عمليات HR+ ==========
  async function addCertificate(form: FormData) {
    await auth.currentUser?.getIdToken(true); // تأكيد claims محدثة

    const title = (form.get("title") as string)?.trim();
    const date = (form.get("date") as string)?.trim();
    const file = form.get("file") as File | null;

    if (!title) {
      toast.error("العنوان مطلوب");
      return;
    }

    let fileUrl = "";
    try {
      // محاولة رفع الملف (لو التخزين غير مُهيّأ، سنلتقط الخطأ ونكمل بدون ملف)
      if (file && file.size > 0) {
        try {
          const safeName = file.name.replace(/\s+/g, "_");
          const path = `certificates/${targetUid}/${Date.now()}__${safeName}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, file);
          fileUrl = await getDownloadURL(storageRef);
        } catch (err) {
          console.warn("Storage upload skipped:", err);
          // نكمل إضافة الشهادة بدون ملف
        }
      }

      const refDoc = await addDoc(
        collection(db, "users", targetUid, "certificates"),
        {
          title,
          fileUrl, // لو مفيش ملف هتظل ""
          date: date || null,
          createdAt: serverTimestamp(),
        }
      );

      setCerts((prev) => [{ id: refDoc.id, title, fileUrl, date }, ...prev]);
      toast.success("تمت إضافة الشهادة");
      (document.getElementById("cert-form") as HTMLFormElement)?.reset();
    } catch (e: any) {
      console.error("addCertificate error:", e?.code, e?.message);
      toast.error(`فشل الإضافة: ${e?.code || "unknown"}`);
    }
  }

  async function removeCertificate(id: string) {
    try {
      await auth.currentUser?.getIdToken(true);
      await deleteDoc(doc(db, "users", targetUid, "certificates", id));
      setCerts((prev) => prev.filter((c) => c.id !== id));
      toast.success("تم الحذف");
    } catch (e: any) {
      console.error("removeCertificate error:", e?.code, e?.message);
      toast.error(`فشل الحذف: ${e?.code || "unknown"}`);
    }
  }

  async function addEvaluation(form: FormData) {
    await auth.currentUser?.getIdToken(true);

    const year = Number(form.get("year"));
    const score = form.get("score") ? Number(form.get("score")) : undefined;
    const notes = (form.get("notes") as string)?.trim();

    if (!year || !Number.isFinite(year)) {
      toast.error("أدخل سنة صحيحة");
      return;
    }

    try {
      const refDoc = await addDoc(
        collection(db, "users", targetUid, "evaluations"),
        {
          year,
          score:
            typeof score === "number" && Number.isFinite(score) ? score : null,
          notes: notes || "",
          createdAt: serverTimestamp(),
        }
      );
      setEvals((prev) => [
        { id: refDoc.id, year, score: score ?? undefined, notes: notes || "" },
        ...prev,
      ]);
      toast.success("تمت إضافة التقييم");
      (document.getElementById("eval-form") as HTMLFormElement)?.reset();
    } catch (e: any) {
      console.error(e);
      toast.error("فشل إضافة التقييم (تحقق من الصلاحيات)");
    }
  }

  async function removeEvaluation(id: string) {
    try {
      await auth.currentUser?.getIdToken(true);
      await deleteDoc(doc(db, "users", targetUid, "evaluations", id));
      setEvals((prev) => prev.filter((e) => e.id !== id));
      toast.success("تم حذف التقييم");
    } catch (e: any) {
      console.error(e);
      toast.error("فشل حذف التقييم (تحقق من الصلاحيات)");
    }
  }

  // ========== عرض ==========
  if (claimsLoading || dataLoading) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        جارٍ التحميل…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="grid gap-6">
      {/* معلومات أساسية */}
      <Card>
        <CardHeader>
          <CardTitle>ملف الموظف</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Info label="الاسم" value={user.name} />
          <Info label="القسم" value={user.department} />
          <Info label="المسمى" value={user.position} />
          <Info label="الدور" value={user.role} />
          <Info label="البريد" value={user.email} mono />
          <Info label="رقم الهوية" value={user.personalInfo?.nationalId} mono />
          <Info label="الجوال" value={user.personalInfo?.phone} mono />
          <Info label="UID" value={user.uid} mono />
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>التعميمات </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {myAnns.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                لا توجد تعميمات
              </div>
            )}
            {myAnns.map((a) => (
              <div key={a.id} className="p-4">
                <div className="font-medium">{a.title}</div>
                {a.content ? (
                  <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {a.content}
                  </div>
                ) : null}
                {a.createdAt?.toDate && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.createdAt.toDate().toLocaleString("ar-SA")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* الشهادات */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">الشهادات</h2>

          {/* أدوات الإدارة تظهر فقط لـ HR+ */}
          <RoleGate min="hr" fallback={null}>
            <form
              id="cert-form"
              className="flex flex-wrap items-end gap-2"
              action={(fd) => startTransition(() => addCertificate(fd))}
            >
              <div>
                <Label className="text-xs">العنوان</Label>
                <Input name="title" placeholder="عنوان الشهادة" />
              </div>
              <div>
                <Label className="text-xs">ملف الشهادة (اختياري)</Label>
                <Input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" />
              </div>
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input name="date" type="date" />
              </div>
              <Button type="submit" disabled={pending}>
                إضافة
              </Button>
            </form>
          </RoleGate>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {certs.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  لا توجد شهادات
                </div>
              )}
              {certs.map((c) => (
                <div
                  key={c.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(c.date)} {c.fileUrl ? "• " : ""}
                      {c.fileUrl ? (
                        <a
                          className="underline"
                          href={c.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          فتح الملف
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <RoleGate min="hr" fallback={null}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeCertificate(c.id)}
                    >
                      حذف
                    </Button>
                  </RoleGate>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* التقييمات */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">التقييمات</h2>

          <RoleGate min="hr" fallback={null}>
            <form
              id="eval-form"
              className="flex flex-wrap items-end gap-2"
              action={(fd) => startTransition(() => addEvaluation(fd))}
            >
              <div>
                <Label className="text-xs">السنة</Label>
                <Input name="year" type="number" placeholder="2025" />
              </div>
              <div>
                <Label className="text-xs">الدرجة (اختياري)</Label>
                <Input name="score" type="number" step="0.1" placeholder="90" />
              </div>
              <div>
                <Label className="text-xs">ملاحظات (اختياري)</Label>
                <Input name="notes" placeholder="..." />
              </div>
              <Button type="submit" disabled={pending}>
                إضافة
              </Button>
            </form>
          </RoleGate>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {evals.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  لا توجد تقييمات
                </div>
              )}
              {evals.map((e) => (
                <div
                  key={e.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">سنة {e.year ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {typeof e.score === "number" ? `الدرجة: ${e.score}` : "—"}{" "}
                      {e.notes ? `• ${e.notes}` : ""}
                    </div>
                  </div>

                  <RoleGate min="hr" fallback={null}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeEvaluation(e.id)}
                    >
                      حذف
                    </Button>
                  </RoleGate>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`truncate ${mono ? "font-mono text-sm" : "font-medium"}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function formatDate(d: any) {
  try {
    if (!d) return "—";
    const dt = typeof d?.toDate === "function" ? d.toDate() : new Date(d);
    if (isNaN(dt as any)) return "—";
    return dt.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function buildUserTokens(user: {
  unit?: string | null;
  schoolKey?: string | null;
  schoolType?: string | null;
  tags?: string[] | null;
}) {
  const tokens: string[] = ["all:all"];
  if (user.unit) tokens.push(`unit:${user.unit}`);
  if (user.schoolKey) tokens.push(`schoolKey:${user.schoolKey}`);
  if (user.schoolType) tokens.push(`schoolType:${user.schoolType}`);
  if (Array.isArray(user.tags))
    for (const t of user.tags) if (t) tokens.push(`tag:${t}`);
  return Array.from(new Set(tokens));
}
