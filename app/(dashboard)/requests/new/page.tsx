"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";

import useClaimsRole from "@/hooks/use-claims-role";
import { auth, db, storage } from "@/lib/firebase";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import {
  getRecipientByKey,
  RECIPIENTS,
  type RequestRecipientKey,
} from "@/lib/internal-requests/recipients";
import { createInternalRequestWithNumber } from "@/lib/internal-requests/firestore";

type UploadedAttachment = {
  name: string;
  size: number;
  contentType: string;
  url: string;
  path: string;
};

function safeFileName(name: string) {
  return name.replace(/[^\w.\-()\s]/g, "_").replace(/\s+/g, "_");
}

async function fanoutRequestNotification(payload: {
  requestId: string;
  toRecipientKeys: string[];
  title: string;
  body: string;
  link: string;
}) {
  const u = auth.currentUser;
  if (!u) return;

  const token = await u.getIdToken();
  const res = await fetch("/api/fanout-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let msg = "تعذر إرسال الإشعار";
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch { }
    throw new Error(msg);
  }
}

export default function NewRequestPage() {
  const router = useRouter();
  const { uid, email, role, loading } = useClaimsRole();
  const [pending, startTransition] = useTransition();

  // جهة المستخدم نفسه (لو واحد من الـ 17) لمنع إرسال لنفسه
  const [myRecipientKey, setMyRecipientKey] =
    useState<RequestRecipientKey | null>(null);
  const [myRecipientLoaded, setMyRecipientLoaded] = useState(false);

  // الجهة الأساسية
  const [mainRecipientKey, setMainRecipientKey] = useState<
    RequestRecipientKey | ""
  >("");

  // نسخة إلى
  const [ccOpen, setCcOpen] = useState(false);
  const [ccRecipientKeys, setCcRecipientKeys] = useState<RequestRecipientKey[]>(
    []
  );

  // بيانات الطلب
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // مرفقات
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const myKey = myRecipientKey; // اللي جاي من users/{uid}.requestRecipientKey
  const myLabel = myKey ? getRecipientByKey(myKey)?.label ?? null : null;

  // ====== Dirty guard (تحذير عند Refresh/Back) ======
  const dirtyRef = useRef(false);
  const allowNavRef = useRef(false);

  const isDirty = useMemo(() => {
    return Boolean(
      (mainRecipientKey && String(mainRecipientKey).length > 0) ||
      (ccRecipientKeys && ccRecipientKeys.length > 0) ||
      title.trim().length > 0 ||
      description.trim().length > 0 ||
      files.length > 0
    );
  }, [mainRecipientKey, ccRecipientKeys, title, description, files.length]);

  useEffect(() => {
    dirtyRef.current = isDirty && !pending;
  }, [isDirty, pending]);

  // تحذير عند Refresh/Close
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // تحذير عند زر Back في المتصفح
  useEffect(() => {
    try {
      window.history.pushState({ __tkw_new_req: true }, "");
    } catch { }

    const onPopState = () => {
      if (allowNavRef.current) return;

      if (dirtyRef.current) {
        const ok = window.confirm("لم يتم حفظ التغييرات. هل تريد الخروج؟");
        if (!ok) {
          try {
            window.history.pushState({ __tkw_new_req: true }, "");
          } catch { }
          return;
        }
      }

      allowNavRef.current = true;
      window.history.back();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ====== اقرأ requestRecipientKey من users/{uid} ======
  useEffect(() => {
    if (loading) return;
    if (!uid) return;

    let cancelled = false;

    (async () => {
      try {
        const refDoc = doc(db, "users", uid);
        const snap = await getDoc(refDoc);
        const data = snap.exists() ? (snap.data() as any) : null;
        const key =
          (data?.requestRecipientKey as RequestRecipientKey | undefined) ?? null;
        if (!cancelled) setMyRecipientKey(key);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setMyRecipientLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, uid]);

  // ====== قوائم الجهات (إخفاء جهته هو) ======
  const availableMainRecipients = useMemo(() => {
    if (!myRecipientLoaded) return RECIPIENTS;
    if (!myRecipientKey) return RECIPIENTS;
    return RECIPIENTS.filter((r) => r.key !== myRecipientKey);
  }, [myRecipientKey, myRecipientLoaded]);

  const availableCcRecipients = useMemo(() => {
    let list = availableMainRecipients; // أصلاً شال جهته هو
    if (mainRecipientKey) list = list.filter((r) => r.key !== mainRecipientKey);
    return list;
  }, [availableMainRecipients, mainRecipientKey]);

  // لو الجهة الأساسية دخلت بالغلط في cc امسحها
  useEffect(() => {
    if (!mainRecipientKey) return;
    setCcRecipientKeys((prev) => prev.filter((k) => k !== mainRecipientKey));
  }, [mainRecipientKey]);

  const ccCount = ccRecipientKeys.length;

  function toggleCcKey(key: RequestRecipientKey, on: boolean) {
    setCcRecipientKeys((prev) => {
      if (on) return prev.includes(key) ? prev : [...prev, key];
      return prev.filter((k) => k !== key);
    });
  }

  async function uploadAttachments(
    requestId: string
  ): Promise<UploadedAttachment[]> {
    if (!files.length) return [];

    const uploaded: UploadedAttachment[] = [];

    for (const f of files) {
      const safe = safeFileName(f.name || "file");
      const path = `internalRequests/${requestId}/attachments/${Date.now()}__${safe}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, f, {
        contentType: f.type || "application/octet-stream",
      });

      const url = await getDownloadURL(storageRef);

      uploaded.push({
        name: f.name,
        size: f.size,
        contentType: f.type || "application/octet-stream",
        url,
        path,
      });
    }

    return uploaded;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!uid || !email) {
      toast.error("برجاء تسجيل الدخول مرة أخرى");
      return;
    }

    if (!mainRecipientKey) {
      toast.error("اختر المرسل إليه");
      return;
    }

    // منع إرسال لنفسه
    if (myRecipientKey && mainRecipientKey === myRecipientKey) {
      toast.error("لا يمكن إرسال الطلب لنفس الجهة");
      return;
    }

    if (!title.trim()) {
      toast.error("عنوان الطلب مطلوب");
      return;
    }

    startTransition(async () => {
      try {
        // 1) إنشاء الطلب (برقم)
        const requestId = await createInternalRequestWithNumber({
          title: title.trim(),
          type: "general",
          description: description.trim(),

          createdByUid: uid,
          createdByEmail: email,
          createdByRole: role ?? "employee",
          createdByDept: null,

          // ✅ لو دالتك بتقبلهم (عشان UI)
          createdByRecipientKey: myKey,
          createdByLabel: myLabel,

          mainRecipientKey: mainRecipientKey as RequestRecipientKey,
          ccRecipientKeys,
        } as any);

        // 2) رفع المرفقات (إن وجدت) ثم ربطها في Firestore
        if (files.length > 0) {
          const tId = toast.loading("جارٍ رفع المرفقات...");
          try {
            const attachments = await uploadAttachments(requestId);
            await updateDoc(doc(db, "internalRequests", requestId), {
              attachments,
              updatedAt: serverTimestamp(),
            });
            toast.dismiss(tId);
            toast.success("تم رفع المرفقات");
          } catch (err: any) {
            toast.dismiss(tId);
            console.error(err);
            toast.error(err?.message || "تم إنشاء الطلب لكن فشل رفع المرفقات");
          }
        }

        // 3) ✅ إشعار الجهة الأساسية + النسخ (بدون إشعار لنفس الجهة لو موجود)
        try {
          const keys = Array.from(
            new Set([mainRecipientKey, ...ccRecipientKeys].filter(Boolean))
          ) as string[];

          // شيل جهة المُنشئ من الإشعار (لو هو أحد الـ 17)
          const finalKeys = myRecipientKey
            ? keys.filter((k) => k !== myRecipientKey)
            : keys;

          if (finalKeys.length) {
            await fanoutRequestNotification({
              requestId,
              toRecipientKeys: finalKeys,
              title: "طلب جديد",
              body: `${myLabel || "منشئ الطلب"}: ${title.trim()}`,
              link: `/requests/${requestId}`,
            });
          }
        } catch (e) {
          console.warn("fanout failed:", e);
          // ما نوقفش الإنشاء
        }

        toast.success("تم إنشاء الطلب بنجاح");

        // اعتبر الصفحة غير dirty
        dirtyRef.current = false;
        allowNavRef.current = true;

        router.push(`/requests/${requestId}`);
      } catch (err: any) {
        console.error(err);
        toast.error(err?.message || "تعذر إنشاء الطلب");
      }
    });
  }

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>إنشاء طلب جديد</CardTitle>
        </CardHeader>

        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {/* المرسل إليه */}
            <div className="grid gap-2">
              <Label className="text-xs">المرسل إليه</Label>

              <Select
                dir="rtl"
                value={mainRecipientKey}
                onValueChange={(val) => setMainRecipientKey(val as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الجهة المستقبِلة" />
                </SelectTrigger>
                <SelectContent>
                  {availableMainRecipients.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="truncate">{r.label}</span>
                        <span className="text-xs text-muted-foreground flex-none">{r.number}</span>
                      </div>
                    </SelectItem>


                  ))}
                </SelectContent>
              </Select>

              {myRecipientKey ? (
                <p className="text-[11px] text-muted-foreground">
                  تم إخفاء جهتك من القائمة لمنع إرسال الطلب لنفسك.
                </p>
              ) : null}
            </div>

            {/* نسخة إلى (قائمة مطوية) */}
            <div className="grid gap-2">
              <Label className="text-xs">نسخة إلى (اختياري)</Label>

              <div className="rounded-md border">
                <button
                  type="button"
                  onClick={() => setCcOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>
                    {ccCount > 0 ? `تم اختيار ${ccCount} جهة` : "اختر جهات للنسخة"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ccOpen ? "إخفاء" : "عرض"}
                  </span>
                </button>

                {ccOpen ? (
                  <div className="border-t p-3 grid gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        (اختياري) تحديد جهات للنسخة
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCcRecipientKeys(
                              availableCcRecipients.map((r) => r.key)
                            )
                          }
                          disabled={availableCcRecipients.length === 0}
                        >
                          تحديد الكل
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCcRecipientKeys([])}
                          disabled={ccRecipientKeys.length === 0}
                        >
                          مسح
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-[240px] overflow-auto grid grid-cols-1 gap-2">
                      {availableCcRecipients.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-4 text-center">
                          لا توجد جهات متاحة للنسخة حاليًا.
                        </div>
                      ) : (
                        availableCcRecipients.map((r) => {
                          const checked = ccRecipientKeys.includes(r.key);
                          return (
                            <label
                              key={r.key}
                              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer select-none transition
                                ${checked
                                  ? "bg-muted font-medium"
                                  : "hover:bg-muted/50"
                                }
                              `}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={(e) =>
                                    toggleCcKey(r.key, e.target.checked)
                                  }
                                />
                                <span className="truncate">{r.label}</span>
                              </div>
                              <span className="text-xs text-muted-foreground flex-none">
                                {r.number}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {ccCount > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  {ccRecipientKeys
                    .map(
                      (k) => RECIPIENTS.find((r) => r.key === k)?.label || k
                    )
                    .join("، ")}
                </div>
              ) : null}
            </div>

            {/* عنوان الطلب */}
            <div className="grid gap-2">
              <Label className="text-xs">عنوان الطلب</Label>
              <Input
                placeholder="مثال: طلب اعتماد ميزانية نشاط ..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* وصف الطلب */}
            <div className="grid gap-2">
              <Label className="text-xs">وصف الطلب</Label>
              <Textarea
                rows={5}
                placeholder={`المكرم /  مثال:الإدارة المالية                سلمه الله
السلام عليكم ورحمة الله وبركاته وبعد:

نص الخطاب...

وتفضلوا بقبول فائق الاحترام،،،
والسلام عليكم ورحمة الله وبركاته،،،

`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

            </div>

            {/* المرفقات */}
            <div className="grid gap-2">
              <Label className="text-xs">المرفقات (اختياري)</Label>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  setFiles(list);
                }}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                اختيار ملفات
              </Button>


              {files.length > 0 ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">الملفات المختارة</div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFiles([])}
                    >
                      مسح الكل
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    {files.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="break-all">{f.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {(f.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                        <Button
                          className="flex-none"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          إزالة
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  سيتم رفع الملفات بعد إنشاء الطلب مباشرة وربطها بالطلب.
                </p>
              )}
            </div>

            {/* الأزرار */}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (dirtyRef.current) {
                    const ok = window.confirm(
                      "لم يتم حفظ التغييرات. هل تريد الخروج؟"
                    );
                    if (!ok) return;
                  }
                  allowNavRef.current = true;
                  router.push("/requests/outbox");
                }}
              >
                إلغاء
              </Button>

              <Button type="submit" disabled={pending}>
                {pending ? "جارٍ الإرسال..." : "إرسال الطلب"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
