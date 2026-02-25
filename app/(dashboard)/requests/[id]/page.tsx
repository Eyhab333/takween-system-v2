"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import MarkdownView from "@/components/ui/MarkdownView";
import useClaimsRole, { Role as ClaimsRole, Role } from "@/hooks/use-claims-role";
import {
  listenInternalRequestById,
  performRequestAction,
} from "@/lib/internal-requests/firestore";
import type {
  InternalRequest,
  RequestActionType,
  RequestStatus,
} from "@/lib/internal-requests/types";
import {
  RECIPIENTS,
  getRecipientByKey,
  getRecipientByEmail,
  type RequestRecipientKey,
} from "@/lib/internal-requests/recipients";

import { auth, db } from "@/lib/firebase";
import { doc as fsDoc, getDoc as fsGetDoc } from "firebase/firestore";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { arrayUnion, updateDoc, serverTimestamp } from "firebase/firestore"
import { storage } from "@/lib/firebase"


type UserMini = {
  label: string;
  recipientKey?: string | null;
  recipientLabel?: string | null;
  email?: string | null;
};

const HR_PLUS: ClaimsRole[] = ["hr", "chairman", "ceo", "admin", "superadmin"];






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

export default function RequestDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const {
    uid: myUid,
    email: myEmail,
    role: myRole,
    loading: claimsLoading,
  } = useClaimsRole();

  const [request, setRequest] = useState<InternalRequest | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const [myRecipientKey, setMyRecipientKey] =
    useState<RequestRecipientKey | null>(null);

  const [userCache, setUserCache] = useState<Record<string, UserMini>>({});

  const [pending, startTransition] = useTransition();

  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTargetKey, setForwardTargetKey] = useState<string>("");
  const [forwardComment, setForwardComment] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingAtt, setUploadingAtt] = useState(false)
  // ===== subscribe request =====
  useEffect(() => {
    if (!id) return;

    const unsub = listenInternalRequestById(id, (req) => {
      setRequest(req);
      setSubscribed(true);
    });

    return () => unsub();
  }, [id]);

  // ===== load my recipientKey from custom claims (fallback by email) =====
  useEffect(() => {
    if (claimsLoading) return;

    let cancelled = false;

    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) {
          if (!cancelled) setMyRecipientKey(null);
          return;
        }

        const token = await u.getIdTokenResult(true);
        const key =
          (token.claims?.requestRecipientKey as RequestRecipientKey | undefined) ??
          null;

        if (!cancelled && key) {
          setMyRecipientKey(key);
          return;
        }

        if (!cancelled && myEmail) {
          const r = getRecipientByEmail(myEmail);
          setMyRecipientKey((r?.key as RequestRecipientKey) ?? null);
        }
      } catch {
        if (!cancelled && myEmail) {
          const r = getRecipientByEmail(myEmail);
          setMyRecipientKey((r?.key as RequestRecipientKey) ?? null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [claimsLoading, myEmail]);

  // ===== build cache for actors (fromUid/toUid) to hide UID in UI =====
  useEffect(() => {
    if (!request) return;

    let cancelled = false;

    const uids = new Set<string>();

    if (request.createdByUid) uids.add(request.createdByUid);
    if (request.currentAssignee?.uid) uids.add(request.currentAssignee.uid);

    for (const a of request.actions || []) {
      if (a?.fromUid) uids.add(a.fromUid);
      if (a?.toUid) uids.add(a.toUid);
    }

    const missing = Array.from(uids).filter((u) => u && !userCache[u]);
    if (missing.length === 0) return;

    (async () => {
      const updates: Record<string, UserMini> = {};

      for (const uid of missing) {
        try {
          const snap = await fsGetDoc(fsDoc(db, "users", uid));
          if (!snap.exists()) {
            updates[uid] = { label: "موظف" };
            continue;
          }

          const data = snap.data() as any;

          const recipientLabel =
            (data.requestRecipientLabel as string | undefined) ?? null;
          const recipientKey =
            (data.requestRecipientKey as RequestRecipientKey | undefined) ?? null;

          const name = (data.name as string | undefined) ?? "";
          const email = (data.email as string | undefined) ?? null;

          const label = recipientLabel || name || email || "موظف";

          updates[uid] = { label, recipientKey, recipientLabel, email };
        } catch {
          updates[uid] = { label: "موظف" };
        }
      }

      if (!cancelled) setUserCache((prev) => ({ ...prev, ...updates }));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  // ===== loading states =====
  if (claimsLoading || !subscribed) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        جارٍ تحميل الطلب…
      </div>
    );
  }

  if (!request) {
  return (
    <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
      لم يتم العثور على هذا الطلب أو قد تم حذفه.
    </div>
  );
}

const req = request;


  // ===== derived =====
  const status = req.status as RequestStatus;
  const isTerminal = ["approved", "rejected", "closed", "cancelled"].includes(
    status
  );

  const isOwner = !!myUid && myUid === req.createdByUid;
  const isAssignedToMe =
    !!myRecipientKey && (req.currentAssigneeKey ?? null) === myRecipientKey;

  const canAct = !isTerminal && isAssignedToMe;
  const canCancel =
    !isTerminal && isOwner && ["open", "in_progress"].includes(status);

  const forwardTargets = (() => {
    const exclude = new Set<string>();
    if (myRecipientKey) exclude.add(myRecipientKey);
    if (req.currentAssigneeKey) exclude.add(req.currentAssigneeKey);
    //if (req.mainRecipientKey) exclude.add(req.mainRecipientKey); // ممكن أحيل حتى لو هو الجهة الأساسية، لأن ممكن الجهة الأساسية مش مسؤولة حالياً
    return RECIPIENTS.filter((r) => !exclude.has(r.key));
  })();

  const requestNumberText =
    req.requestNumber ||
    (req.mainRecipientNumber ? `${req.mainRecipientNumber}/—` : "—");

  const mainRecipientLabel =
    req.mainRecipientLabel ||
    (req.mainRecipientKey ? getRecipientByKey(req.mainRecipientKey)?.label : null) ||
    "غير محددة";

  const currentAssigneeLabel =
    req.currentAssigneeLabel ||
    (req.currentAssigneeKey ? getRecipientByKey(req.currentAssigneeKey)?.label : null) ||
    "—";

  const creatorLabel = (() => {
    const byEmail = req.createdByEmail ? getRecipientByEmail(req.createdByEmail) : undefined;
    if (byEmail) return byEmail.label;

    const c = userCache[req.createdByUid];
    if (c?.label) return c.label;

    return "موظف";
  })();

  function statusLabel(s: string) {
    const map: Record<string, string> = {
      open: "مفتوح",
      in_progress: "قيد المعالجة",
      approved: "معتمد",
      rejected: "مرفوض",
      closed: "مغلق",
      cancelled: "ملغي",
    };
    return map[s] ?? s;
  }

  function actionLabel(t: RequestActionType) {
    const map: Record<string, string> = {
      submitted: "تم إنشاء الطلب",
      forwarded: "تمت إحالة الطلب",
      approved: "تم اعتماد الطلب",
      rejected: "تم رفض الطلب",
      comment: "تعليق على الطلب",
      closed: "تم إغلاق الطلب",
      generated_pdf: "تم توليد ملف PDF",
    };
    return map[t] ?? t;
  }

  function roleLabel(role: string) {
    const map: Record<string, string> = {
      employee: "موظف",
      hr: "الموارد البشرية",
      chairman: "رئيس المجلس",
      ceo: "المدير التنفيذي",
      admin: "مشرف",
      superadmin: "superadmin",
    };
    return map[role] ?? role;
  }

  function actorLabelByUid(uid?: string | null, role?: string | null) {
    if (!uid) {
      if (role) return roleLabel(role);
      return "غير محدد";
    }
    const cached = userCache[uid];
    if (cached?.label) return cached.label;
    if (role) return roleLabel(role);
    return "موظف";
  }

  function recipientLabelByKey(key?: string | null) {
    if (!key) return "—";
    const r = getRecipientByKey(key as any);
    return r?.label ?? key;
  }

  function getCreatorRecipientKey(): string | null {
    // 1) لو محفوظ في الدوك
    const direct = (req as any)?.createdByRecipientKey as string | undefined;
    if (direct) return direct;

    // 2) من كاش users
    const cached = userCache[req.createdByUid];
    if (cached?.recipientKey) return cached.recipientKey;

    // 3) من الإيميل لو هو من الـ 17
    const byEmail = req.createdByEmail ? getRecipientByEmail(req.createdByEmail) : null;
    return byEmail?.key ?? null;
  }

  function buildNotifKeys(extra?: string[]) {
    const keys: string[] = [];

    const creatorKey = getCreatorRecipientKey();
    if (creatorKey) keys.push(creatorKey);

    if (req.currentAssigneeKey) keys.push(req.currentAssigneeKey);

    const ccKeys = Array.isArray((req as any).ccRecipientKeys)
      ? ((req as any).ccRecipientKeys as string[])
      : [];
    keys.push(...ccKeys);

    if (extra?.length) keys.push(...extra);

    // unique + remove my key (عشان ما يجيش إشعار لنفسي)
    const uniq = Array.from(new Set(keys.filter(Boolean)));
    return myRecipientKey ? uniq.filter((k) => k !== myRecipientKey) : uniq;
  }

  // ===== actions handlers (مع إشعارات) =====
  function doComment() {
    if (!myUid) return toast.error("سجّل الدخول مرة أخرى");
    const text = commentText.trim();
    if (!text) return toast.error("اكتب التعليق أولاً");

    startTransition(async () => {
      try {
        await performRequestAction({
          requestId: req.id,
          actionType: "comment",
          actorUid: myUid,
          actorRole: (myRole as any) ?? "employee",
          comment: text,
        });

        // إشعار: منشئ الطلب + الـ CC + (المسؤول الحالي لو مش هو نفس المعلّق)
        try {
          const toKeys = buildNotifKeys();
          if (toKeys.length) {
            await fanoutRequestNotification({
              requestId: req.id,
              toRecipientKeys: toKeys,
              title: "تعليق على طلب",
              body: `${creatorLabel}: ${req.title || ""}`,
              link: `/requests/${req.id}`,
            });
          }
        } catch (e) {
          console.warn("fanout failed:", e);
        }

        toast.success("تم إضافة التعليق");
        setCommentText("");
        setCommentOpen(false);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "تعذر إضافة التعليق");
      }
    });
  }

  function doForward() {
    if (!myUid) return toast.error("سجّل الدخول مرة أخرى");
    if (!forwardTargetKey) return toast.error("اختر الجهة المُحال إليها");

    startTransition(async () => {
      try {
        await performRequestAction({
          requestId: req.id,
          actionType: "forwarded",
          actorUid: myUid,
          actorRole: (myRole as any) ?? "employee",
          targetRecipientKey: forwardTargetKey as any,
          targetUid: null,
          targetRole: null,
          comment: forwardComment.trim(),
        });

        // إشعار: الجهة الجديدة + المنشئ + CC
        try {
          const toKeys = buildNotifKeys([forwardTargetKey]);
          if (toKeys.length) {
            await fanoutRequestNotification({
              requestId: req.id,
              toRecipientKeys: toKeys,
              title: "تمت إحالة طلب",
              body: `${creatorLabel}: ${req.title || ""}`,
              link: `/requests/${req.id}`,
            });
          }
        } catch (e) {
          console.warn("fanout failed:", e);
        }

        toast.success("تمت إحالة الطلب");
        setForwardComment("");
        setForwardTargetKey("");
        setForwardOpen(false);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "تعذر إحالة الطلب");
      }
    });
  }

  function doSimpleAction(type: "approved" | "rejected" | "closed") {
    if (!myUid) return toast.error("سجّل الدخول مرة أخرى");

    startTransition(async () => {
      try {
        await performRequestAction({
          requestId: req.id,
          actionType: type,
          actorUid: myUid,
          actorRole: (myRole as any) ?? "employee",
          comment: "",
        });

        // إشعار: المنشئ + CC
        try {
          const toKeys = buildNotifKeys();
          if (toKeys.length) {
            const titleMap: Record<string, string> = {
              approved: "تم اعتماد الطلب",
              rejected: "تم رفض الطلب",
              closed: "تم إغلاق الطلب",
            };
            await fanoutRequestNotification({
              requestId: req.id,
              toRecipientKeys: toKeys,
              title: titleMap[type] || "تحديث على الطلب",
              body: `${creatorLabel}: ${req.title || ""}`,
              link: `/requests/${req.id}`,
            });
          }
        } catch (e) {
          console.warn("fanout failed:", e);
        }

        const map: Record<string, string> = {
          approved: "تم اعتماد الطلب",
          rejected: "تم رفض الطلب",
          closed: "تم إغلاق الطلب",
        };

        toast.success(map[type] ?? "تم التنفيذ");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "تعذر تنفيذ الإجراء");
      }
    });
  }

  function doCancel() {
    if (!myUid) return toast.error("سجّل الدخول مرة أخرى");

    startTransition(async () => {
      try {
        await performRequestAction({
          requestId: req.id,
          actionType: "comment",
          actorUid: myUid,
          actorRole: (myRole as any) ?? "employee",
          comment: "تم إلغاء الطلب بواسطة منشئ الطلب",
          newStatus: "cancelled",
        });

        // إشعار: الجهة الحالية + CC
        try {
          const toKeys = buildNotifKeys();
          if (toKeys.length) {
            await fanoutRequestNotification({
              requestId: req.id,
              toRecipientKeys: toKeys,
              title: "تم إلغاء الطلب",
              body: `${creatorLabel}: ${req.title || ""}`,
              link: `/requests/${req.id}`,
            });
          }
        } catch (e) {
          console.warn("fanout failed:", e);
        }

        toast.success("تم إلغاء الطلب");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "تعذر إلغاء الطلب");
      }
    });
  }


  function safeFileName(name: string) {
    return name.replace(/[^\w.\-()\s]/g, "_").replace(/\s+/g, "_")
  }
  //const HR_ROLES: Role[] = ["hr", "chairman", "ceo", "admin", "superadmin"];
  //const { role } = useClaimsRole();
  //const isHrOrAbove = role ? HR_ROLES.includes(role) : false;
  
  async function uploadMoreAttachments(files: File[]) {
    

    if (!req?.id) return
    if (!myUid) return toast.error("سجّل الدخول مرة أخرى")
    if (!files.length) return
    
    
    // السماح بالرفع للـ owner أو الجهة الحالية (أو HR+ لو تحب)
    const canUpload = !isTerminal && (isOwner || isAssignedToMe || (myRole && HR_PLUS.includes(myRole as any)))

    if (!canUpload) return toast.error("ليس لديك صلاحية رفع مرفقات لهذا الطلب")

    setUploadingAtt(true)
    const tId = toast.loading("جارٍ رفع المرفقات...")

    try {
      const uploaded: any[] = []

      for (const f of files) {
        const safe = safeFileName(f.name || "file")
        const path = `internalRequests/${req.id}/attachments/${Date.now()}__${safe}`
        const storageRef = ref(storage, path)

        await uploadBytes(storageRef, f, {
          contentType: f.type || "application/octet-stream",
        })

        const url = await getDownloadURL(storageRef)

        uploaded.push({
          name: f.name,
          size: f.size,
          contentType: f.type || "application/octet-stream",
          url,
          path,
          uploadedByUid: myUid,
          uploadedByLabel: actorLabelByUid(myUid, myRole as any),
          uploadedAtMs: Date.now(),
        })
      }

      await updateDoc(fsDoc(db, "internalRequests", req.id), {
        attachments: arrayUnion(...uploaded),
        updatedAt: serverTimestamp(),
      })

      toast.dismiss(tId)
      toast.success("تم رفع المرفقات")
    } catch (e: any) {
      console.error(e)
      toast.dismiss(tId)
      toast.error(e?.message || "فشل رفع المرفقات")
    } finally {
      setUploadingAtt(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }


  const lastAction =
    req.actions && req.actions.length > 0 ? req.actions[req.actions.length - 1] : null;

  return (
    <div className="grid gap-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg truncate">
              {req.title || "طلب بدون عنوان"}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              رقم الطلب: <span className="font-medium">{requestNumberText}</span>
              {lastAction?.actionType ? (
                <span className="mr-2">• آخر حركة: {actionLabel(lastAction.actionType as any)}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(`/requests/${req.id}/print`, "_blank", "noopener,noreferrer")}
            >
              طباعة / PDF
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              طباعة / الصفحة كاملة
            </Button>
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs">
              {statusLabel(status)}
            </span>
          </div>
        </CardHeader>


        <CardContent className="grid gap-3 text-sm">
          <div className="grid md:grid-cols-2 gap-3">
            <InfoRow label="الجهة الأساسية" value={mainRecipientLabel} />
            <InfoRow label="المسؤول الحالي" value={currentAssigneeLabel} />

            <InfoRow
              label="منشئ الطلب"
              value={req.createdByEmail ? `${creatorLabel} — ${req.createdByEmail}` : creatorLabel}
            />

            <InfoRow
              label="تاريخ الإنشاء"
              value={req.createdAt ? req.createdAt.toLocaleString("ar-SA") : "—"}
            />

            <InfoRow
              label="آخر تحديث"
              value={req.updatedAt ? req.updatedAt.toLocaleString("ar-SA") : "—"}
            />
          </div>

          <Separator />

          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">وصف الطلب</div>
            <MarkdownView value={req.description || ""} />
          </div>

          {req.pdfUrl ? (
            <div className="mt-3">
              <a
                href={req.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline text-primary"
              >
                فتح ملف الـ PDF المرتبط بالطلب
              </a>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              رجوع
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* الإجراءات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الإجراءات</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {canAct || canCancel ? (
            <>
              <div className="flex flex-wrap gap-2">
                {canAct && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setForwardOpen(false);
                      setCommentOpen((v) => !v);
                    }}
                  >
                    تعليق
                  </Button>
                )}

                {canAct && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCommentOpen(false);
                      setForwardOpen((v) => !v);
                    }}
                  >
                    إحالة
                  </Button>
                )}

                {canAct && (
                  <>
                    <Button
                      type="button"
                      onClick={() => doSimpleAction("approved")}
                      disabled={pending}
                    >
                      اعتماد
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => doSimpleAction("rejected")}
                      disabled={pending}
                    >
                      رفض
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => doSimpleAction("closed")}
                      disabled={pending}
                    >
                      إغلاق
                    </Button>
                  </>
                )}

                {canCancel && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={doCancel}
                    disabled={pending}
                  >
                    إلغاء الطلب
                  </Button>
                )}
              </div>

              {commentOpen && canAct ? (
                <div className="rounded-md border p-3 grid gap-2">
                  <Label className="text-xs">اكتب تعليقك</Label>
                  <Textarea
                    rows={4}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="اكتب ملاحظة أو توضيح..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCommentOpen(false)}
                    >
                      إغلاق
                    </Button>
                    <Button type="button" onClick={doComment} disabled={pending}>
                      {pending ? "جارٍ الإرسال..." : "إرسال التعليق"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {forwardOpen && canAct ? (
                <div className="rounded-md border p-3 grid gap-3">
                  <div className="grid gap-2">
                    <Label className="text-xs">الجهة المُحال إليها</Label>
                    <Select
                      value={forwardTargetKey}
                      onValueChange={(v) => setForwardTargetKey(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الجهة" />
                      </SelectTrigger>
                      <SelectContent>
                        {forwardTargets.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {forwardTargets.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        لا توجد جهات متاحة للإحالة (بعد الاستبعاد).
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs">ملاحظة للإحالة (اختياري)</Label>
                    <Input
                      value={forwardComment}
                      onChange={(e) => setForwardComment(e.target.value)}
                      placeholder="مثال: يرجى المتابعة والرد..."
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setForwardOpen(false)}
                    >
                      إغلاق
                    </Button>
                    <Button type="button" onClick={doForward} disabled={pending}>
                      {pending ? "جارٍ الإرسال..." : "تنفيذ الإحالة"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">لا توجد إجراءات متاحة لك على هذا الطلب.</div>
          )}
        </CardContent>
      </Card>
      {/* المرفقات */}
      <Separator />

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">المرفقات</div>

          {/* زر رفع مرفق */}
          {!isTerminal && (isOwner || isAssignedToMe) ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => uploadMoreAttachments(Array.from(e.target.files || []))}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAtt || pending}
              >
                {uploadingAtt ? "جارٍ الرفع..." : "رفع مرفق"}
              </Button>
            </>
          ) : null}
        </div>

        {(!req.attachments || req.attachments.length === 0) ? (
          <div className="text-sm text-muted-foreground">لا توجد مرفقات.</div>
        ) : (
          <div className="grid gap-2">
            {req.attachments.map((a, idx) => (
              <div key={idx} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(a.size / 1024).toFixed(0)} KB
                    {a.uploadedByLabel ? <> • رُفع بواسطة: {a.uploadedByLabel}</> : null}
                    {a.uploadedAtMs ? <> • {new Date(a.uploadedAtMs).toLocaleString("ar-SA")}</> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline text-primary"
                  >
                    تحميل
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* خط سير الطلب */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">خط سير الطلب (الإحالات والحركات)</CardTitle>
        </CardHeader>
        <CardContent>
          {(!req.actions || req.actions.length === 0) && (
            <div className="text-sm text-muted-foreground">
              لا توجد حركات مسجلة على هذا الطلب حتى الآن.
            </div>
          )}

          {req.actions && req.actions.length > 0 && (
            <div className="space-y-4">
              {req.actions.map((a, idx) => {
                const fromText =
                  a.actionType === "submitted"
                    ? creatorLabel
                    : actorLabelByUid(a.fromUid, a.fromRole as any);

                const toText =
                  (a as any).toRecipientKey
                    ? recipientLabelByKey((a as any).toRecipientKey)
                    : actorLabelByUid(a.toUid, a.toRole as any);

                return (
                  <div key={idx} className="relative pl-4 border-r pr-2 border-dashed">
                    <div className="absolute -right-[6px] top-1 w-3 h-3 rounded-full bg-primary/80" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">
                        {actionLabel(a.actionType as any)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.at ? a.at.toLocaleString("ar-SA") : "—"}
                      </div>
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      من: {fromText}
                      {toText && toText !== "—" ? <> → إلى: {toText}</> : null}
                    </div>

                    {a.comment && a.comment.trim() && (
                      <div className="mt-2 text-xs whitespace-pre-wrap border rounded-md bg-muted/40 px-2 py-1">
                        {a.comment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value && value !== "" ? value : "—"}</div>
    </div>
  );
}
