"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ComplianceResource = {
  key: string;
  title: string;
  category: string;
  version: string;
  requiresAcknowledgement: boolean;
  storagePath: string;
  fileUrl: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgementVersion: string | null;
};

type ComplianceResponse = {
  ok: boolean;
  resources: ComplianceResource[];
};

function formatAcknowledgementDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("ar-SA");
}

export default function EmployeeJobCompliancePanel({ uid }: { uid: string }) {
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgingKey, setAcknowledgingKey] = useState<string | null>(null);

  const loadResources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("لم يتم العثور على توكن تسجيل الدخول");
        return;
      }

      const params = new URLSearchParams({ uid });
      const response = await fetch(`/api/job-compliance?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok) {
        setError(json?.error || "تعذر تحميل ملفات الالتزام الوظيفي");
        return;
      }

      setData(json as ComplianceResponse);
    } catch (loadError) {
      console.error(loadError);
      setError("حدث خطأ أثناء تحميل ملفات الالتزام الوظيفي");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  async function acknowledge(resourceKey: string) {
    try {
      setAcknowledgingKey(resourceKey);

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error("لم يتم العثور على توكن تسجيل الدخول");
        return;
      }

      const response = await fetch("/api/job-compliance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid, resourceKey }),
      });
      const json = await response.json();

      if (!response.ok) {
        toast.error(json?.error || "تعذر حفظ الإقرار");
        return;
      }

      toast.success("تم حفظ الإقرار بنجاح");
      await loadResources();
    } catch (acknowledgementError) {
      console.error(acknowledgementError);
      toast.error("حدث خطأ أثناء حفظ الإقرار");
    } finally {
      setAcknowledgingKey(null);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  const resources = data?.resources || [];

  if (resources.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          لا توجد ملفات التزام وظيفي متاحة حالياً.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        الإقرار يعني تأكيد اطلاعك على محتوى الوثيقة والالتزام بما ورد فيها.
      </div>

      {resources.map((resource) => {
        const acknowledgedAt = formatAcknowledgementDate(resource.acknowledgedAt);
        const isAcknowledging = acknowledgingKey === resource.key;

        return (
          <Card key={resource.key}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>{resource.title}</CardTitle>
                  <CardDescription>
                    {resource.category} · الإصدار {resource.version}
                  </CardDescription>
                </div>
                <div
                  className={
                    resource.acknowledged
                      ? "inline-flex items-center gap-1 text-sm text-emerald-700"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {resource.acknowledged ? <CheckCircle2 className="h-4 w-4" /> : null}
                  {resource.acknowledged ? "تم الإقرار" : "لم يتم الإقرار"}
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {resource.acknowledged && acknowledgedAt
                  ? `تاريخ الإقرار: ${acknowledgedAt}`
                  : "يرجى الاطلاع على الملف قبل الإقرار."}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline">
                  <a href={resource.fileUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="ms-2 h-4 w-4" />
                    عرض وتحميل الملف
                  </a>
                </Button>

                {resource.requiresAcknowledgement ? (
                  <Button
                    type="button"
                    onClick={() => acknowledge(resource.key)}
                    disabled={resource.acknowledged || isAcknowledging}
                  >
                    {isAcknowledging ? "جارٍ الحفظ..." : "أقر بالاطلاع والالتزام"}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
