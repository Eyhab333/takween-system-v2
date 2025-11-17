/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useTransition } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";

import useClaimsRole, { Role } from "@/hooks/use-claims-role";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ======= ثوابت الاستهداف =======
const HR_ROLES: Role[] = ["hr", "chairman", "ceo", "admin", "superadmin"];

const SCHOOL_OPTIONS = [
  { key: "manar_boys", label: "منار الريادة — بنين" },
  { key: "manar_girls", label: "منار الريادة — بنات" },
  { key: "rawdat_1", label: "روضة واحة الرياحين الأولى" },
  { key: "rawdat_2", label: "روضة واحة الرياحين الثانية" },
  { key: "rawdat_3", label: "روضة واحة الرياحين الثالثة" },
  { key: "rawdat_4", label: "روضة واحة الرياحين الرابعة" },
] as const;

const UNIT_OPTIONS = [
  { key: "council", label: "مجلس الإدارة" },
  { key: "executive", label: "الإدارة التنفيذية" },
  { key: "supervision", label: "الإشراف التعليمي" },
  { key: "school", label: "المدارس" },
] as const;

const ROLE_OPTIONS: Role[] = [
  "employee",
  "hr",
  "chairman",
  "ceo",
  "admin",
  "superadmin",
];

// ======= أنواع محلية =======
type Ann = {
  id: string;
  title: string;
  content?: string;
  createdAt?: any;
  audTokens: string[];
  createdBy?: string;
  pinned?: boolean;
};

// ======= صفحة التعميمات =======
export default function AnnouncementsPage() {
  const { role, uid, loading } = useClaimsRole();
  const [pending, startTransition] = useTransition();
  const [anns, setAnns] = useState<Ann[]>([]);
  const [myUserDoc, setMyUserDoc] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"mine" | "all" | "forMe">("forMe");

  const isHrOrAbove = !!role && HR_ROLES.includes(role);

  // حمّل وثيقة المستخدم لاستخراج userTokens لاحقًا
  useEffect(() => {
    if (loading || !uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        setMyUserDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [loading, uid]);

  // استعلام التعميمات الموجهة للمستخدم الحالي
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        let list: Ann[] = [];

        if (viewMode === "forMe") {
          const tokens = buildUserTokens({
            unit: myUserDoc?.unit ?? null,
            schoolKey: myUserDoc?.schoolKey ?? null,
            schoolType: myUserDoc?.schoolType ?? null,
            tags: Array.isArray(myUserDoc?.tags) ? myUserDoc?.tags : [],
          });
          const tokens10 = tokens.slice(0, 10);

          const qy = query(
            collection(db, "announcements"),
            where("audTokens", "array-contains-any", tokens10),
            orderBy("createdAt", "desc"),
            limit(50)
          );
          const snap = await getDocs(qy);
          list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        }

        if (viewMode === "mine") {
          const qy = query(
            collection(db, "announcements"),
            where("createdBy", "==", uid),
            orderBy("createdAt", "desc"),
            limit(50)
          );
          const snap = await getDocs(qy);
          list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        }

        if (viewMode === "all") {
          const qy = query(
            collection(db, "announcements"),
            orderBy("createdAt", "desc"),
            limit(50)
          );
          const snap = await getDocs(qy);
          list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        }

        setAnns(list);
      } catch (e) {
        console.error(e);
        toast.error("تعذر تحميل التعميمات");
      }
    })();
  }, [uid, myUserDoc, viewMode]);

  // إنشاء تعميم مع اختيار الجمهور + إشعارات
  async function addAnnouncement(form: FormData) {
    if (!isHrOrAbove) return;
    try {
      const title = (form.get("title") as string)?.trim();
      const content = (form.get("content") as string)?.trim() || "";

      if (!title) {
        toast.error("العنوان مطلوب");
        return;
      }

      // قراءة اختيارات الجمهور من الفورم
      const allFlag = form.get("aud_all") === "on";

      const selectedSchools = form.getAll("aud_school") as string[]; // مفاتيح من SCHOOL_OPTIONS
      const selectedUnits = form.getAll("aud_unit") as string[]; // council/executive/...
      const selectedRoles = form.getAll("aud_role") as string[]; // employee/hr/...
      const rawTags = (form.get("aud_tags") as string)?.trim() || "";
      const tagList = parseTags(rawTags); // يحول "teachers;staff" => ["teachers","staff"]

      // بناء audTokens
      const audTokens = buildAudienceTokens({
        all: allFlag,
        schools: selectedSchools,
        units: selectedUnits,
        roles: selectedRoles,
        tags: tagList,
      });

      if (audTokens.length === 0) {
        toast.error("اختر جمهورًا للتعميم أو اختر (للجميع)");
        return;
      }

      // حفظ التعميم نفسه
      const annRef = await addDoc(collection(db, "announcements"), {
        title,
        content,
        audTokens,
        createdAt: serverTimestamp(),
        createdBy: uid || null,
        pinned: false,
      });

      // إشعارات للمستهدفين
      try {
        const targetUids = await resolveAudienceUserIds(audTokens);
        if (targetUids.length > 0) {
          const notifPromises = targetUids.map((userId) =>
            addDoc(collection(db, "users", userId, "notifications"), {
              title: "تعميم جديد",
              body: title,
              type: "announcement",
              link: "/announcements",
              annId: annRef.id,
              createdAt: serverTimestamp(),
              read: false,
            })
          );
          await Promise.all(notifPromises);
        }
      } catch (e) {
        console.warn("announcement notifications error:", e);
      }

      toast.success("تم إنشاء التعميم");
      (document.getElementById("ann-form") as HTMLFormElement)?.reset();

      // إعادة تحميل مبسطة (الموجّه لي)
      const tokens = buildUserTokens({
        unit: myUserDoc?.unit ?? null,
        schoolKey: myUserDoc?.schoolKey ?? null,
        schoolType: myUserDoc?.schoolType ?? null,
        tags: Array.isArray(myUserDoc?.tags) ? myUserDoc?.tags : [],
      }).slice(0, 10);

      const qy = query(
        collection(db, "announcements"),
        where("audTokens", "array-contains-any", tokens),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(qy);
      setAnns(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) {
      console.error(e);
      toast.error("فشل إنشاء التعميم");
    }
  }

  // حذف تعميم (HR+ فقط)
  async function deleteAnnouncement(id: string) {
    if (!isHrOrAbove) return;
    if (!confirm("حذف هذا التعميم؟ سيختفي من الجميع.")) return;
    try {
      await deleteDoc(doc(db, "announcements", id));
      setAnns((prev) => prev.filter((a) => a.id !== id));
      toast.success("تم حذف التعميم");
    } catch (e: any) {
      console.error(e);
      toast.error("فشل حذف التعميم (تحقق من الصلاحيات)");
    }
  }

  // تبديل “مقروء/غير مقروء” للمستخدم الحالي
  async function toggleRead(annId: string) {
    if (!uid) return;
    try {
      const rdRef = doc(db, "announcements", annId, "reads", uid);
      const rdSnap = await getDoc(rdRef);
      if (rdSnap.exists()) {
        await deleteDoc(rdRef); // اجعله "غير مقروء"
      } else {
        await setDoc(rdRef, { readAt: serverTimestamp() }); // اجعله "مقروء"
      }
      // UI مجرد تبديل محلي سريع
      setAnns((prev) => [...prev]);
    } catch (e: any) {
      console.error(e);
      toast.error("تعذر تبديل حالة القراءة");
    }
  }

  if (loading) return null;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>انشاء تعميم</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* نموذج الإضافة — HR+ فقط */}
          {isHrOrAbove && (
            <form
              id="ann-form"
              className="grid gap-4"
              action={(fd) => startTransition(() => addAnnouncement(fd))}
            >
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs">العنوان</Label>
                  <Input name="title" placeholder="مثال: تعميم هام" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">المحتوى (اختياري)</Label>
                  <Textarea name="content" placeholder="نص التعميم ..." />
                </div>
              </div>

              <Separator />

              {/* اختيار الجمهور */}
              <div className="grid gap-2">
                <div className="font-semibold">الجمهور المستهدف</div>

                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" name="aud_all" />
                  <span>للجميع</span>
                </label>

                <div className="grid md:grid-cols-3 gap-4">
                  {/* المدارس */}
                  <div className="border rounded p-3">
                    <div className="text-sm font-medium mb-2">المدارس</div>
                    <div className="grid gap-2">
                      {SCHOOL_OPTIONS.map((s) => (
                        <label
                          key={s.key}
                          className="inline-flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            name="aud_school"
                            value={s.key}
                          />
                          <span>{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* الوحدات */}
                  <div className="border rounded p-3">
                    <div className="text-sm font-medium mb-2">الوحدات</div>
                    <div className="grid gap-2">
                      {UNIT_OPTIONS.map((u) => (
                        <label
                          key={u.key}
                          className="inline-flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            name="aud_unit"
                            value={u.key}
                          />
                          <span>{u.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* الأدوار */}
                  <div className="border rounded p-3">
                    <div className="text-sm font-medium mb-2">الأدوار</div>
                    <div className="grid gap-2">
                      {ROLE_OPTIONS.map((r) => (
                        <label
                          key={r}
                          className="inline-flex items-center gap-2"
                        >
                          <input type="checkbox" name="aud_role" value={r} />
                          <span>{r}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* الوسوم الحرة */}
                <div className="grid gap-2">
                  <Label className="text-xs">
                    وسوم إضافية (اختياري) — افصل بـ ;
                  </Label>
                  <Input name="aud_tags" placeholder="teachers;staff" />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={pending}>
                    إضافة التعميم
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    لو اخترت (للجميع) لن نُضيف اختيارات أخرى؛ أما بدونها فسنحوّل
                    الاختيارات إلى audTokens.
                  </span>
                </div>
              </div>
            </form>
          )}

          <CardHeader>
            <CardTitle>جميع التعميمات </CardTitle>
          </CardHeader>
          {isHrOrAbove && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={viewMode === "forMe" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("forMe")}
              >
                الموجّه لي
              </Button>
              <Button
                variant={viewMode === "mine" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("mine")}
              >
                ما أنشأتُه
              </Button>
              <Button
                variant={viewMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("all")}
              >
                جميع التعميمات
              </Button>
            </div>
          )}

          {/* القائمة */}
          <div className="rounded-md border">
            {anns.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                لا توجد تعميمات
              </div>
            ) : (
              <div className="divide-y">
                {anns.map((a) => (
                  <AnnRow
                    key={a.id}
                    ann={a}
                    myUid={uid || ""}
                    canDelete={isHrOrAbove}
                    onDelete={() => deleteAnnouncement(a.id)}
                    onToggleRead={() => toggleRead(a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ======= صف تعميم =======
function AnnRow({
  ann,
  myUid,
  canDelete,
  onDelete,
  onToggleRead,
}: {
  ann: Ann;
  myUid: string;
  canDelete: boolean;
  onDelete: () => void;
  onToggleRead: () => void;
}) {
  const [isRead, setIsRead] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rdSnap = await getDoc(
          doc(db, "announcements", ann.id, "reads", myUid)
        );
        if (mounted) setIsRead(rdSnap.exists());
      } catch {
        if (mounted) setIsRead(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ann.id, myUid]);

  return (
    <div className="p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-semibold truncate">{ann.title}</div>
          {isRead ? (
            <span className="text-xs rounded bg-green-100 text-green-700 px-2 py-0.5">
              مقروء
            </span>
          ) : (
            <span className="text-xs rounded bg-gray-100 text-gray-700 px-2 py-0.5">
              غير مقروء
            </span>
          )}
        </div>
        {ann.content ? (
          <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
            {ann.content}
          </div>
        ) : null}
        {ann.createdAt?.toDate && (
          <div className="text-xs text-muted-foreground mt-1">
            {ann.createdAt.toDate().toLocaleString("ar-SA")}
          </div>
        )}
        {/* عرض مختصر للجمهور */}
        <div className="text-xs text-muted-foreground mt-1 break-words">
          {renderAudienceHint(ann.audTokens)}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onToggleRead();
            setIsRead((v) => !v);
          }}
        >
          {isRead ? "علّم كغير مقروء" : "علّم كمقروء"}
        </Button>
        {canDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            حذف
          </Button>
        )}
      </div>
    </div>
  );
}

// ======= أدوات مساعدة =======

// تحويل وسوم free-text إلى مصفوفة
function parseTags(s: string): string[] {
  const raw = s
    .replace(/,/g, ";")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

// audTokens من خيارات الجمهور
function buildAudienceTokens({
  all,
  schools,
  units,
  roles,
  tags,
}: {
  all: boolean;
  schools: string[];
  units: string[];
  roles: string[];
  tags: string[];
}) {
  if (all) return ["all:all"];

  const tokens: string[] = [];

  for (const sk of schools) tokens.push(`schoolKey:${sk}`);
  for (const u of units) tokens.push(`unit:${u}`);
  for (const r of roles) tokens.push(`role:${r}`);
  for (const t of tags) tokens.push(`tag:${t}`);

  return Array.from(new Set(tokens));
}

// tokens الخاصة بمستخدم معين
function buildUserTokens(user: {
  unit?: string | null;
  schoolKey?: string | null;
  schoolType?: string | null;
  tags?: string[] | null;
}) {
  const tokens: string[] = [];
  tokens.push("all:all");
  if (user.unit) tokens.push(`unit:${user.unit}`);
  if (user.schoolKey) tokens.push(`schoolKey:${user.schoolKey}`);
  if (user.schoolType) tokens.push(`schoolType:${user.schoolType}`);
  if (Array.isArray(user.tags)) {
    for (const t of user.tags) if (t) tokens.push(`tag:${t}`);
  }
  return Array.from(new Set(tokens));
}

// ترجمة audTokens لنص مقروء
function renderAudienceHint(audTokens: string[]) {
  if (audTokens.includes("all:all")) return "موجّه إلى: الجميع";
  const mapLabel = (tok: string) => {
    if (tok.startsWith("schoolKey:")) {
      const key = tok.split(":")[1];
      const opt = SCHOOL_OPTIONS.find((s) => s.key === key);
      return opt ? `مدرسة: ${opt.label}` : `مدرسة: ${key}`;
    }
    if (tok.startsWith("unit:")) return `وحدة: ${tok.split(":")[1]}`;
    if (tok.startsWith("role:")) return `دور: ${tok.split(":")[1]}`;
    if (tok.startsWith("tag:")) return `وسم: ${tok.split(":")[1]}`;
    if (tok.startsWith("schoolType:")) return `نوع مدرسة: ${tok.split(":")[1]}`;
    return tok;
  };
  const readable = audTokens.map(mapLabel).join(" • ");
  return `موجّه إلى: ${readable}`;
}

// استخراج قائمة الـ UIDs المستهدفة من audTokens
async function resolveAudienceUserIds(audTokens: string[]): Promise<string[]> {
  const hasAll = audTokens.includes("all:all");

  const schoolKeys: string[] = [];
  const units: string[] = [];
  const roles: string[] = [];
  const tags: string[] = [];

  for (const tok of audTokens) {
    if (tok.startsWith("schoolKey:")) {
      schoolKeys.push(tok.split(":")[1]);
    } else if (tok.startsWith("unit:")) {
      units.push(tok.split(":")[1]);
    } else if (tok.startsWith("role:")) {
      roles.push(tok.split(":")[1]);
    } else if (tok.startsWith("tag:")) {
      tags.push(tok.split(":")[1]);
    }
  }

  const seen = new Set<string>();
  const queries: Promise<any>[] = [];

  // "للجميع" = كل من عليه tag staff (أو كل الموظفين لو حابب تعدّلها لاحقًا)
  if (hasAll) {
    queries.push(
      getDocs(
        query(
          collection(db, "users"),
          where("tags", "array-contains", "staff"),
          limit(500)
        )
      )
    );
  }

  for (const sk of schoolKeys) {
    queries.push(
      getDocs(
        query(collection(db, "users"), where("schoolKey", "==", sk), limit(500))
      )
    );
  }

  for (const u of units) {
    queries.push(
      getDocs(
        query(collection(db, "users"), where("unit", "==", u), limit(500))
      )
    );
  }

  for (const r of roles) {
    queries.push(
      getDocs(
        query(collection(db, "users"), where("role", "==", r), limit(500))
      )
    );
  }

  for (const t of tags) {
    queries.push(
      getDocs(
        query(
          collection(db, "users"),
          where("tags", "array-contains", t),
          limit(500)
        )
      )
    );
  }

  const snaps = await Promise.all(queries);

  for (const snap of snaps) {
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as any;
      const userId = data.uid || docSnap.id;
      if (userId) seen.add(userId);
    }
  }

  return Array.from(seen);
}
