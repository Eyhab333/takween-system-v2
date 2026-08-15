"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ComplianceDocument = {
  id: string;
  title: string;
  category: string;
  version: string;
  active: boolean;
  requiresAcknowledgement: boolean;
  sortOrder: number;
  totalTargetEmployees: number;
  acknowledgedCount: number;
  pendingCount: number;
};

type ProgressDetail = {
  id: string;
  title: string;
  totalTargetEmployees: number;
  acknowledgedCount: number;
  pendingCount: number;
  employeeStatuses: Array<{
    uid: string;
    name: string;
    role: string;
    acknowledged: boolean;
    acknowledgedAt: string | null;
  }>;
};

export default function JobComplianceAdminPanel() {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedProgress, setSelectedProgress] = useState<ProgressDetail | null>(null);
  const [progressLoadingId, setProgressLoadingId] = useState<string | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<"all" | "acknowledged" | "pending">("all");

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("لم يتم العثور على توكن تسجيل الدخول");
        return;
      }

      const response = await fetch("/api/admin/job-compliance", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || "تعذر تحميل مستندات الالتزام الوظيفي");
        return;
      }
      setDocuments(json.documents || []);
    } catch (loadError) {
      console.error(loadError);
      setError("حدث خطأ أثناء تحميل مستندات الالتزام الوظيفي");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    try {
      setSubmitting(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error("لم يتم العثور على توكن تسجيل الدخول");
        return;
      }

      const formData = new FormData(form);
      const acknowledgementControl = form.elements.namedItem("requiresAcknowledgement") as HTMLInputElement;
      formData.set("requiresAcknowledgement", String(acknowledgementControl.checked));

      const response = await fetch("/api/admin/job-compliance", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        toast.error(json?.error || "تعذر رفع المستند");
        return;
      }

      form.reset();
      toast.success("تم رفع مستند الالتزام الوظيفي");
      await loadDocuments();
    } catch (submitError) {
      console.error(submitError);
      toast.error("حدث خطأ أثناء رفع المستند");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(document: ComplianceDocument) {
    try {
      setUpdatingId(document.id);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error("لم يتم العثور على توكن تسجيل الدخول");
        return;
      }

      const response = await fetch(`/api/admin/job-compliance/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !document.active }),
      });
      const json = await response.json();
      if (!response.ok) {
        toast.error(json?.error || "تعذر تحديث حالة المستند");
        return;
      }

      toast.success(document.active ? "تم تعطيل المستند" : "تم تفعيل المستند");
      await loadDocuments();
    } catch (updateError) {
      console.error(updateError);
      toast.error("حدث خطأ أثناء تحديث حالة المستند");
    } finally {
      setUpdatingId(null);
    }
  }

  async function loadProgress(documentId: string) {
    try {
      setProgressLoadingId(documentId);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error("لم يتم العثور على توكن تسجيل الدخول");
        return;
      }

      const response = await fetch(`/api/admin/job-compliance/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) {
        toast.error(json?.error || "تعذر تحميل تفاصيل الإقرارات");
        return;
      }

      setSelectedProgress({
        id: json.document.id,
        title: json.document.title,
        totalTargetEmployees: json.totalTargetEmployees,
        acknowledgedCount: json.acknowledgedCount,
        pendingCount: json.pendingCount,
        employeeStatuses: json.employeeStatuses || [],
      });
    } catch (progressError) {
      console.error(progressError);
      toast.error("حدث خطأ أثناء تحميل تفاصيل الإقرارات");
    } finally {
      setProgressLoadingId(null);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>إضافة مستند التزام وظيفي</CardTitle>
          <CardDescription>يتم رفع الملف بصيغة PDF وحفظه في مساحة تخزين خاصة.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={createDocument}>
            <Field label="العنوان" id="title"><Input id="title" name="title" required /></Field>
            <Field label="التصنيف" id="category"><Input id="category" name="category" required /></Field>
            <Field label="النسخة" id="version"><Input id="version" name="version" placeholder="v1" required /></Field>
            <Field label="ترتيب العرض" id="sortOrder"><Input id="sortOrder" name="sortOrder" type="number" min="0" defaultValue="0" required /></Field>
            <Field label="ملف PDF" id="file"><Input id="file" name="file" type="file" accept="application/pdf,.pdf" required /></Field>
            <label className="flex items-center gap-2 self-end text-sm">
              <input name="requiresAcknowledgement" type="checkbox" defaultChecked />
              يتطلب إقرار
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting}>{submitting ? "جارٍ الرفع..." : "رفع المستند"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>مستندات الالتزام الوظيفي</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {loading && <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && documents.length === 0 && <div className="text-sm text-muted-foreground">لا توجد مستندات مضافة حتى الآن.</div>}

          {documents.map((document) => (
            <div key={document.id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" />{document.title}</div>
                  <div className="text-sm text-muted-foreground">{document.category} · الإصدار {document.version} · ترتيب العرض {document.sortOrder}</div>
                  <div className="text-xs text-muted-foreground">{document.active ? "نشط" : "غير نشط"} · {document.requiresAcknowledgement ? "يتطلب إقرار" : "لا يتطلب إقرار"}</div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <ProgressStat label="المستهدفون" value={document.totalTargetEmployees} />
                  <ProgressStat label="تم الإقرار" value={document.acknowledgedCount} />
                  <ProgressStat label="بانتظار الإقرار" value={document.pendingCount} />
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => toggleActive(document)} disabled={updatingId === document.id}>
                  {updatingId === document.id ? "جارٍ التحديث..." : document.active ? "تعطيل المستند" : "تفعيل المستند"}
                </Button>
                <Button type="button" onClick={() => loadProgress(document.id)} disabled={progressLoadingId === document.id}>
                  <Users className="ms-2 h-4 w-4" />
                  {progressLoadingId === document.id ? "جارٍ التحميل..." : "عرض الإقرارات"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedProgress && (
        <Card>
          <CardHeader>
            <CardTitle>متابعة الإقرارات: {selectedProgress.title}</CardTitle>
            <CardDescription>المستهدفون: {selectedProgress.totalTargetEmployees} · تم الإقرار: {selectedProgress.acknowledgedCount} · بانتظار الإقرار: {selectedProgress.pendingCount}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={employeeFilter === "all" ? "default" : "outline"}
                onClick={() => setEmployeeFilter("all")}
              >
                الكل
              </Button>
              <Button
                type="button"
                size="sm"
                variant={employeeFilter === "acknowledged" ? "default" : "outline"}
                onClick={() => setEmployeeFilter("acknowledged")}
              >
                تم الإقرار
              </Button>
              <Button
                type="button"
                size="sm"
                variant={employeeFilter === "pending" ? "default" : "outline"}
                onClick={() => setEmployeeFilter("pending")}
              >
                بانتظار الإقرار
              </Button>
            </div>

            {selectedProgress.employeeStatuses.filter((employee) =>
              employeeFilter === "all" ||
              (employeeFilter === "acknowledged" && employee.acknowledged) ||
              (employeeFilter === "pending" && !employee.acknowledged),
            ).length === 0 ? (
              <div className="text-sm text-muted-foreground">لا يوجد موظفون ضمن هذا التصنيف.</div>
            ) : (
              <div className="divide-y rounded-lg border">
                {selectedProgress.employeeStatuses
                  .filter((employee) =>
                    employeeFilter === "all" ||
                    (employeeFilter === "acknowledged" && employee.acknowledged) ||
                    (employeeFilter === "pending" && !employee.acknowledged),
                  )
                  .map((employee) => (
                  <div key={employee.uid} className="p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      {employee.acknowledged ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Clock3 className="h-4 w-4 text-amber-600" />
                      )}
                      <span>{employee.name || "—"}</span>
                    </div>
                    <div className={employee.acknowledged ? "text-xs text-emerald-700" : "text-xs text-muted-foreground"}>
                      {employee.acknowledged ? "تم الإقرار" : "بانتظار الإقرار"}
                      {employee.acknowledgedAt
                        ? ` · ${new Date(employee.acknowledgedAt).toLocaleString("ar-SA")}`
                        : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
