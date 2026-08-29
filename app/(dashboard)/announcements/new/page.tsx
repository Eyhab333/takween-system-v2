"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { toast } from "sonner";

import useClaimsRole from "@/hooks/use-claims-role";
import { auth, db, storage } from "@/lib/firebase";
import {
  buildAudienceTokens,
  parseTags,
  ROLE_OPTIONS,
  SCHOOL_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  UNIT_OPTIONS,
} from "@/lib/announcements/audience";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const MAX_PDF_SIZE_MB = 10;

type AudiencePerson = {
  uid: string;
  label: string;
};

type ManagementGroup = {
  id: string;
  label: string;
  schoolType: string;
  positionCode: string;
};

function toggleInList(
  current: string[],
  value: string,
  checked: boolean,
): string[] {
  if (checked) {
    return current.includes(value) ? current : [...current, value];
  }
  return current.filter((x) => x !== value);
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-()\s]/g, "_").replace(/\s+/g, "_");
}

function CheckboxGroup({
  title,
  items,
  values,
  disabled,
  onChange,
}: {
  title: string;
  items: readonly { key: string; label: string }[];
  values: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs">{title}</Label>
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {items.map((item) => {
          const checked = values.includes(item.key);

          return (
            <label
              key={item.key}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                disabled ? "opacity-60" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={checked}
                onChange={(e) =>
                  onChange(toggleInList(values, item.key, e.target.checked))
                }
              />
              <span>{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function NewAnnouncementPage() {
  const router = useRouter();
  const { uid, email, role, loading } = useClaimsRole();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [allUsers, setAllUsers] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedSchoolTypes, setSelectedSchoolTypes] = useState<string[]>([]);
  const [selectedPositionCodes, setSelectedPositionCodes] = useState<string[]>([]);
  const [selectedManagementGroupIds, setSelectedManagementGroupIds] = useState<string[]>([]);
  const [selectedPersonUids, setSelectedPersonUids] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [positionOptions, setPositionOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [managementGroups, setManagementGroups] = useState<ManagementGroup[]>([]);
  const [people, setPeople] = useState<AudiencePerson[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [audienceOptionsLoading, setAudienceOptionsLoading] = useState(true);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (role !== "superadmin") {
      router.replace("/announcements");
    }
  }, [loading, role, router]);

  useEffect(() => {
    if (loading || role !== "superadmin") return;

    let cancelled = false;

    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("تعذر التحقق من جلسة المستخدم");

        const response = await fetch("/api/announcements/audience-options", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "تعذر تحميل خيارات الجمهور");
        }

        if (!cancelled) {
          setPositionOptions(Array.isArray(data?.positions) ? data.positions : []);
          setManagementGroups(
            Array.isArray(data?.managementGroups) ? data.managementGroups : [],
          );
          setPeople(Array.isArray(data?.people) ? data.people : []);
        }
      } catch (error) {
        console.error("announcement audience options error:", error);
        if (!cancelled) toast.error("تعذر تحميل خيارات الجمهور");
      } finally {
        if (!cancelled) setAudienceOptionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, role]);

  if (loading || role !== "superadmin") {
    return null;
  }

  function validatePdf(file: File | null) {
    if (!file) return null;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return "المرفق يجب أن يكون ملف PDF فقط";
    }

    if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
      return `حجم ملف PDF يجب ألا يتجاوز ${MAX_PDF_SIZE_MB} MB`;
    }

    return null;
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();

    if (!uid || !email) {
      toast.error("سجّل الدخول مرة أخرى");
      return;
    }

    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    const tags = parseTags(tagsInput);

    if (!cleanTitle) {
      toast.error("عنوان التعميم مطلوب");
      return;
    }

    const pdfError = validatePdf(pdfFile);
    if (pdfError) {
      toast.error(pdfError);
      return;
    }

    const audTokens = buildAudienceTokens({
      all: allUsers,
      roles: selectedRoles,
      units: selectedUnits,
      schools: selectedSchools,
      schoolTypes: selectedSchoolTypes,
      tags,
      positionCodes: selectedPositionCodes,
      personUids: selectedPersonUids,
      schoolTypePositions: selectedManagementGroupIds.flatMap((groupId) => {
        const group = managementGroups.find((item) => item.id === groupId);
        return group
          ? [{ schoolType: group.schoolType, positionCode: group.positionCode }]
          : [];
      }),
    });

    if (audTokens.length === 0) {
      toast.error("حدّد الجمهور المستهدف أو اختر للجميع");
      return;
    }

    startTransition(async () => {
      let uploadFailed = false;

      try {
        const annRef = await addDoc(collection(db, "announcements"), {
          title: cleanTitle,
          content: cleanContent,
          audTokens,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdByUid: uid,
          createdByEmail: email,
          pinned: false,
          hasPdf: false,
          pdfPath: null,
          pdfName: null,
          pdfSize: null,
          pdfContentType: null,
        });

        if (pdfFile) {
          try {
            const safeName = safeFileName(pdfFile.name || "announcement.pdf");
            const path = `announcements/${annRef.id}/attachment/${Date.now()}__${safeName}`;
            const storageRef = ref(storage, path);

            await uploadBytes(storageRef, pdfFile, {
              contentType: "application/pdf",
            });

            await updateDoc(doc(db, "announcements", annRef.id), {
              hasPdf: true,
              pdfPath: path,
              pdfName: pdfFile.name,
              pdfSize: pdfFile.size,
              pdfContentType: "application/pdf",
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            console.error("announcement pdf upload error:", e);
            uploadFailed = true;
          }
        }

        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("تعذر التحقق من جلسة المستخدم");
        }

        const res = await fetch("/api/fanout-announcement", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            annId: annRef.id,
            title: cleanTitle,
            audTokens,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "فشل إرسال إشعارات التعميم");
        }

        if (uploadFailed) {
          toast.success("تم إنشاء التعميم، لكن فشل رفع ملف الـ PDF");
        } else {
          toast.success("تم إنشاء التعميم وإرسال الإشعارات");
        }

        router.push("/announcements");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "تعذر إنشاء التعميم");
      }
    });
  }

  const visiblePeople = people
    .filter((person) =>
      person.label
        .toLocaleLowerCase("ar")
        .includes(peopleQuery.trim().toLocaleLowerCase("ar")),
    )
    .slice(0, 60);

  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>إنشاء تعميم جديد</CardTitle>
        </CardHeader>

        <CardContent>
          <form className="grid gap-5" onSubmit={submitForm}>
            <div className="grid gap-2">
              <Label className="text-xs">العنوان</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: تعميم بخصوص اختبارات منتصف الفصل"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">المحتوى</Label>
              <Textarea
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="اكتب نص التعميم هنا..."
              />
            </div>

            <div className="rounded-md border p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allUsers}
                  onChange={(e) => setAllUsers(e.target.checked)}
                />
                <span>إرسال التعميم إلى الجميع</span>
              </label>

              <div className="mt-2 text-xs text-muted-foreground">
                عند اختيار هذا الخيار لا تحتاج لتحديد بقية الفئات.
              </div>
            </div>

            <CheckboxGroup
              title="حسب الدور"
              items={ROLE_OPTIONS.map((roleItem) => ({
                key: roleItem,
                label: roleItem,
              }))}
              values={selectedRoles}
              disabled={allUsers}
              onChange={setSelectedRoles}
            />

            <CheckboxGroup
              title="حسب الوحدة"
              items={UNIT_OPTIONS}
              values={selectedUnits}
              disabled={allUsers}
              onChange={setSelectedUnits}
            />

            <CheckboxGroup
              title="حسب المدرسة / الروضة"
              items={SCHOOL_OPTIONS}
              values={selectedSchools}
              disabled={allUsers}
              onChange={setSelectedSchools}
            />

            <CheckboxGroup
              title="حسب نوع الجهة"
              items={SCHOOL_TYPE_OPTIONS}
              values={selectedSchoolTypes}
              disabled={allUsers}
              onChange={setSelectedSchoolTypes}
            />

            <CheckboxGroup
              title="حسب الوظيفة"
              items={positionOptions}
              values={selectedPositionCodes}
              disabled={allUsers || audienceOptionsLoading}
              onChange={setSelectedPositionCodes}
            />

            <CheckboxGroup
              title="مجموعات إدارية"
              items={managementGroups.map((group) => ({
                key: group.id,
                label: group.label,
              }))}
              values={selectedManagementGroupIds}
              disabled={allUsers || audienceOptionsLoading}
              onChange={setSelectedManagementGroupIds}
            />

            <div className="grid gap-2">
              <Label className="text-xs">أشخاص محددون</Label>
              <Input
                value={peopleQuery}
                onChange={(event) => setPeopleQuery(event.target.value)}
                disabled={allUsers || audienceOptionsLoading}
                placeholder="ابحث بالاسم أو الوظيفة أو الجهة"
              />
              <div className="grid gap-2 rounded-md border p-3">
                {audienceOptionsLoading ? (
                  <div className="text-xs text-muted-foreground">جارٍ تحميل الموظفين...</div>
                ) : visiblePeople.length === 0 ? (
                  <div className="text-xs text-muted-foreground">لا توجد نتائج مطابقة.</div>
                ) : (
                  visiblePeople.map((person) => {
                    const checked = selectedPersonUids.includes(person.uid);
                    return (
                      <label
                        key={person.uid}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          allUsers ? "opacity-60" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={allUsers}
                          checked={checked}
                          onChange={(event) =>
                            setSelectedPersonUids(
                              toggleInList(
                                selectedPersonUids,
                                person.uid,
                                event.target.checked,
                              ),
                            )
                          }
                        />
                        <span>{person.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {!audienceOptionsLoading && people.length > visiblePeople.length ? (
                <div className="text-[11px] text-muted-foreground">
                  تظهر أول 60 نتيجة؛ استخدم البحث لتضييق القائمة.
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">وسوم إضافية</Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                disabled={allUsers}
                placeholder="مثال: teachers;staff"
              />
              <div className="text-[11px] text-muted-foreground">
                افصل بين الوسوم بفاصلة أو فاصلة منقوطة.
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">ملف PDF مرفق (اختياري)</Label>

              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setPdfFile(file);
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pdfInputRef.current?.click()}
                >
                  اختيار ملف PDF
                </Button>

                {pdfFile ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPdfFile(null);
                      if (pdfInputRef.current) pdfInputRef.current.value = "";
                    }}
                  >
                    إزالة الملف
                  </Button>
                ) : null}
              </div>

              {pdfFile ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium break-all">{pdfFile.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  يمكنك إرفاق ملف PDF مع التعميم، وسيظهر للمستخدمين زر فتح وزر تحميل.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/announcements")}
              >
                إلغاء
              </Button>

              <Button type="submit" disabled={pending}>
                {pending ? "جارٍ الإنشاء..." : "إنشاء التعميم"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
