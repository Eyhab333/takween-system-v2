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
  type RequestRecipientKey,
} from "@/lib/internal-requests/recipients";
import { createInternalRequestWithNumber } from "@/lib/internal-requests/firestore";
import { formatCreatorDisplayLabel } from "@/lib/internal-requests/creator-label";

type TargetedRecipient = {
  label: string;
  uid: string;
  role: string | null;
  orgUnitId: string;
  positionCode: string;
  legacyRecipientKey: RequestRecipientKey | null;
  legacyRecipientNumber: number | null;
  personTarget: { mode: "PERSON"; uid: string };
  positionTargets: Array<{
    mode: "POSITION";
    orgUnitId: string;
    positionCode: string;
  }>;
};

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
    body: JSON.stringify({
      requestId: payload.requestId,
      title: payload.title,
      body: payload.body,
      link: payload.link,
    }),
  });
  if (!res.ok) {
    let msg = "تعذر إرسال الإشعار";
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch {}
    throw new Error(msg);
  }
}
export default function NewRequestPage() {
  const router = useRouter();
  const { uid, email, role, loading } = useClaimsRole();
  const [pending, startTransition] = useTransition();
  const [myRecipientKey, setMyRecipientKey] =
    useState<RequestRecipientKey | null>(null);
  const [myRecipientLoaded, setMyRecipientLoaded] = useState(false);
  const [createdByDisplayLabel, setCreatedByDisplayLabel] = useState<string | null>(null);
  const [targetedRecipients, setTargetedRecipients] = useState<
    TargetedRecipient[]
  >([]);
  const [targetingLoaded, setTargetingLoaded] = useState(false);
  const [mainRecipientUid, setMainRecipientUid] = useState("");
  const [ccOpen, setCcOpen] = useState(false);
  const [ccRecipientUids, setCcRecipientUids] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const myKey = myRecipientKey;
  const myLabel = myKey ? (getRecipientByKey(myKey)?.label ?? null) : null;
  const dirtyRef = useRef(false);
  const allowNavRef = useRef(false);
  const isDirty = useMemo(() => {
    return Boolean(
      mainRecipientUid.length > 0 ||
      ccRecipientUids.length > 0 ||
      title.trim().length > 0 ||
      description.trim().length > 0 ||
      files.length > 0,
    );
  }, [mainRecipientUid, ccRecipientUids, title, description, files.length]);
  useEffect(() => {
    dirtyRef.current = isDirty && !pending;
  }, [isDirty, pending]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  useEffect(() => {
    try {
      window.history.pushState({ __tkw_new_req: true }, "");
    } catch {}
    const onPopState = () => {
      if (allowNavRef.current) return;
      if (dirtyRef.current) {
        const ok = window.confirm("لم يتم حفظ التغييرات. هل تريد الخروج؟");
        if (!ok) {
          try {
            window.history.pushState({ __tkw_new_req: true }, "");
          } catch {}
          return;
        }
      }
      allowNavRef.current = true;
      window.history.back();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setMyRecipientKey(null);
      setCreatedByDisplayLabel(null);
      setMyRecipientLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const refDoc = doc(db, "users", uid);
        const snap = await getDoc(refDoc);
        const data = snap.exists() ? (snap.data() as any) : null;
        const key =
          (data?.requestRecipientKey as RequestRecipientKey | undefined) ??
          null;
        if (!cancelled) {
          setMyRecipientKey(key);
          setCreatedByDisplayLabel(formatCreatorDisplayLabel(data ?? {}));
        }
      } catch {
        if (!cancelled) {
          setMyRecipientKey(null);
          setCreatedByDisplayLabel(null);
        }
      } finally {
        if (!cancelled) setMyRecipientLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, uid]);
  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setTargetedRecipients([]);
      setTargetingLoaded(true);
      return;
    }

    let cancelled = false;
    setTargetingLoaded(false);

    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) throw new Error("No authenticated user");
        const token = await user.getIdToken();
        const response = await fetch("/api/internal-requests/targeting", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();

        if (
          !response.ok ||
          payload?.source !== "engine" ||
          !Array.isArray(payload?.recipients)
        ) {
          throw new Error("Targeting data is unavailable");
        }

        if (!cancelled) {
          setTargetedRecipients(payload.recipients as TargetedRecipient[]);
        }
      } catch {
        if (!cancelled) setTargetedRecipients([]);
      } finally {
        if (!cancelled) setTargetingLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, uid]);
  const recipientSource = useMemo(() => {
    if (!myRecipientLoaded || !targetingLoaded) return [];
    return targetedRecipients;
  }, [myRecipientLoaded, targetedRecipients, targetingLoaded]);
  const availableMainRecipients = useMemo(() => {
    return recipientSource.filter((recipient) => recipient.uid !== uid);
  }, [recipientSource, uid]);
  const availableCcRecipients = useMemo(() => {
    return recipientSource.filter(
      (recipient) =>
        recipient.uid !== uid && recipient.uid !== mainRecipientUid,
    );
  }, [mainRecipientUid, recipientSource, uid]);
  useEffect(() => {
    setCcRecipientUids((prev) =>
      prev.filter(
        (recipientUid) =>
          recipientUid !== mainRecipientUid &&
          availableCcRecipients.some((recipient) => recipient.uid === recipientUid),
      ),
    );
  }, [availableCcRecipients, mainRecipientUid]);
  const ccCount = ccRecipientUids.length;
  function toggleCcUid(recipientUid: string, on: boolean) {
    setCcRecipientUids((prev) => {
      if (on) return prev.includes(recipientUid) ? prev : [...prev, recipientUid];
      return prev.filter((uid) => uid !== recipientUid);
    });
  }
  async function uploadAttachments(
    requestId: string,
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
    if (!uid) {
      toast.error("برجاء تسجيل الدخول مرة أخرى");
      return;
    }
    if (!mainRecipientUid) {
      toast.error("اختر المرسل إليه");
      return;
    }
    if (mainRecipientUid === uid) {
      toast.error("لا يمكن إرسال الطلب لنفس الجهة");
      return;
    }
    const mainRecipientIsAllowed = availableMainRecipients.some(
      (recipient) => recipient.uid === mainRecipientUid,
    );
    if (!mainRecipientIsAllowed) {
      toast.error("هذه الجهة غير متاحة لك");
      return;
    }
    if (!title.trim()) {
      toast.error("عنوان الطلب مطلوب");
      return;
    }
    startTransition(async () => {
      const selectedMainRecipient = recipientSource.find(
        (recipient) => recipient.uid === mainRecipientUid,
      );
      if (!selectedMainRecipient) {
        toast.error("Ù‡Ø°Ù‡ Ø§Ù„Ø¬Ù‡Ø© ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ù„Ùƒ");
        return;
      }
      const safeCcRecipients = Array.from(
        new Set(
          ccRecipientUids.filter(
            (recipientUid) =>
              recipientUid !== mainRecipientUid &&
              availableCcRecipients.some((recipient) => recipient.uid === recipientUid),
          ),
        ),
      )
        .map((recipientUid) =>
          recipientSource.find((recipient) => recipient.uid === recipientUid),
        )
        .filter((recipient): recipient is TargetedRecipient => Boolean(recipient));
      try {
        const requestId = await createInternalRequestWithNumber({
          title: title.trim(),
          type: "general",
          description: description.trim(),
          createdByUid: uid,
          createdByEmail: email ?? null,
          createdByRole: role ?? "employee",
          createdByDept: null,
          createdByRecipientKey: myKey,
          createdByLabel: createdByDisplayLabel,
          mainRecipient: {
            uid: selectedMainRecipient.uid,
            role: selectedMainRecipient.role as any,
            label: selectedMainRecipient.label,
            orgUnitId: selectedMainRecipient.orgUnitId,
            positionCode: selectedMainRecipient.positionCode,
            legacyRecipientKey: selectedMainRecipient.legacyRecipientKey,
            legacyRecipientNumber: selectedMainRecipient.legacyRecipientNumber,
          },
          ccRecipients: safeCcRecipients.map((recipient) => ({
            uid: recipient.uid,
            legacyRecipientKey: recipient.legacyRecipientKey,
          })),
        });
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
        try {
          await fanoutRequestNotification({
            requestId,
            title: "طلب جديد",
            body: `${myLabel || "منشئ الطلب"}: ${title.trim()}`,
            link: `/requests/${requestId}`,
          });
        } catch (e) {
          console.warn("fanout failed:", e);
        }
        toast.success("تم إنشاء الطلب بنجاح");
        dirtyRef.current = false;
        allowNavRef.current = true;
        router.push(`/requests/${requestId}`);
      } catch (err: any) {
        console.error(err);
        toast.error(err?.message || "تعذر إنشاء الطلب");
      }
    });
  }
  if (loading || !myRecipientLoaded || !targetingLoaded) return null;
  return (
    <div className="max-w-2xl mx-auto">
      {" "}
      <Card>
        {" "}
        <CardHeader>
          {" "}
          <CardTitle>إنشاء طلب جديد</CardTitle>{" "}
        </CardHeader>{" "}
        <CardContent>
          {" "}
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {" "}
            <div className="grid gap-2">
              {" "}
              <Label className="text-xs">المرسل إليه</Label>{" "}
              <Select
                dir="rtl"
                value={mainRecipientUid}
                onValueChange={(val) =>
                  setMainRecipientUid(val)
                }
              >
                {" "}
                <SelectTrigger>
                  {" "}
                  <SelectValue placeholder="اختر الجهة المستقبِلة" />{" "}
                </SelectTrigger>{" "}
                <SelectContent>
                  {" "}
                  {availableMainRecipients.map((r) => (
                    <SelectItem key={r.uid} value={r.uid}>
                      {" "}
                      <div className="flex items-center justify-between w-full gap-2">
                        {" "}
                        <span className="truncate">{r.label}</span>{" "}
                        <span className="text-xs text-muted-foreground flex-none">
                          {" "}
                          {r.positionCode}{" "}
                        </span>{" "}
                      </div>{" "}
                    </SelectItem>
                  ))}{" "}
                </SelectContent>{" "}
              </Select>{" "}
              {myRecipientKey ? (
                <p className="text-[11px] text-muted-foreground">
                  {" "}
                  تم إخفاء جهتك من القائمة لمنع إرسال الطلب لنفسك.{" "}
                </p>
              ) : null}{" "}
            </div>{" "}
            <div className="grid gap-2">
              {" "}
              <Label className="text-xs">نسخة إلى (اختياري)</Label>{" "}
              <div className="rounded-md border">
                {" "}
                <button
                  type="button"
                  onClick={() => setCcOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm"
                >
                  {" "}
                  <span>
                    {" "}
                    {ccCount > 0
                      ? `تم اختيار ${ccCount} جهة`
                      : "اختر جهات للنسخة"}{" "}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    {ccOpen ? "إخفاء" : "عرض"}{" "}
                  </span>{" "}
                </button>{" "}
                {ccOpen ? (
                  <div className="border-t p-3 grid gap-3">
                    {" "}
                    <div className="flex items-center justify-between gap-2">
                      {" "}
                      <div className="text-xs text-muted-foreground">
                        {" "}
                        (اختياري) تحديد جهات للنسخة{" "}
                      </div>{" "}
                      <div className="flex items-center gap-2">
                        {" "}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCcRecipientUids(
                              availableCcRecipients.map((r) => r.uid),
                            )
                          }
                          disabled={availableCcRecipients.length === 0}
                        >
                          {" "}
                          تحديد الكل{" "}
                        </Button>{" "}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCcRecipientUids([])}
                          disabled={ccRecipientUids.length === 0}
                        >
                          {" "}
                          مسح{" "}
                        </Button>{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="max-h-[240px] overflow-auto grid grid-cols-1 gap-2">
                      {" "}
                      {availableCcRecipients.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-4 text-center">
                          {" "}
                          لا توجد جهات متاحة للنسخة حاليًا.{" "}
                        </div>
                      ) : (
                        availableCcRecipients.map((r) => {
                          const checked = ccRecipientUids.includes(r.uid);
                          return (
                            <label
                              key={r.uid}
                              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer select-none transition ${checked ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
                            >
                              {" "}
                              <div className="flex items-center gap-2 min-w-0">
                                {" "}
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={(e) =>
                                    toggleCcUid(r.uid, e.target.checked)
                                  }
                                />{" "}
                                <span className="truncate">{r.label}</span>{" "}
                              </div>{" "}
                              <span className="text-xs text-muted-foreground flex-none">
                                {" "}
                                {r.positionCode}{" "}
                              </span>{" "}
                            </label>
                          );
                        })
                      )}{" "}
                    </div>{" "}
                  </div>
                ) : null}{" "}
              </div>{" "}
              {ccCount > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  {" "}
                  {ccRecipientUids
                    .map(
                      (recipientUid) =>
                        recipientSource.find((r) => r.uid === recipientUid)?.label ||
                        recipientUid,
                    )
                    .join("، ")}{" "}
                </div>
              ) : null}{" "}
            </div>{" "}
            <div className="grid gap-2">
              {" "}
              <Label className="text-xs">عنوان الطلب</Label>{" "}
              <Input
                placeholder="مثال: طلب اعتماد ميزانية نشاط ..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />{" "}
            </div>{" "}
            <div className="grid gap-2">
              {" "}
              <Label className="text-xs">وصف الطلب</Label>{" "}
              <Textarea
                rows={5}
                placeholder={`المكرم / مثال: الإدارة المالية سلمه الله السلام عليكم ورحمة الله وبركاته وبعد: نص الخطاب... وتفضلوا بقبول فائق الاحترام،،، والسلام عليكم ورحمة الله وبركاته،،، `}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />{" "}
            </div>{" "}
            <div className="grid gap-2">
              {" "}
              <Label className="text-xs">المرفقات (اختياري)</Label>{" "}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  setFiles(list);
                }}
              />{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                {" "}
                اختيار ملفات{" "}
              </Button>{" "}
              {files.length > 0 ? (
                <div className="rounded-md border p-3 text-sm">
                  {" "}
                  <div className="flex items-center justify-between mb-2">
                    {" "}
                    <div className="font-medium">الملفات المختارة</div>{" "}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFiles([])}
                    >
                      {" "}
                      مسح الكل{" "}
                    </Button>{" "}
                  </div>{" "}
                  <div className="grid gap-2">
                    {" "}
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        {" "}
                        <div className="flex-1 min-w-0">
                          {" "}
                          <div className="break-all">{f.name}</div>{" "}
                          <div className="text-xs text-muted-foreground">
                            {" "}
                            {(f.size / 1024).toFixed(0)} KB{" "}
                          </div>{" "}
                        </div>{" "}
                        <Button
                          className="flex-none"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          {" "}
                          إزالة{" "}
                        </Button>{" "}
                      </div>
                    ))}{" "}
                  </div>{" "}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {" "}
                  سيتم رفع الملفات بعد إنشاء الطلب مباشرة وربطها بالطلب.{" "}
                </p>
              )}{" "}
            </div>{" "}
            <div className="flex items-center justify-end gap-2">
              {" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (dirtyRef.current) {
                    const ok = window.confirm(
                      "لم يتم حفظ التغييرات. هل تريد الخروج؟",
                    );
                    if (!ok) return;
                  }
                  allowNavRef.current = true;
                  router.push("/requests/outbox");
                }}
              >
                {" "}
                إلغاء{" "}
              </Button>{" "}
              <Button type="submit" disabled={pending}>
                {" "}
                {pending ? "جارٍ الإرسال..." : "إرسال الطلب"}{" "}
              </Button>{" "}
            </div>{" "}
          </form>{" "}
        </CardContent>{" "}
      </Card>{" "}
    </div>
  );
}
