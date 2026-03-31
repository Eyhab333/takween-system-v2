/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { auth } from "@/lib/firebase";
import { getEmployeeSectionConfig } from "@/lib/employee-file-sections";

type EmployeeSheet = Record<string, string>;

export default function EmployeeSectionDataCard({
  nationalId,
  section,
}: {
  nationalId?: string | null;
  section: string;
}) {
  const sectionConfig = getEmployeeSectionConfig(section);

  const [employeeSheet, setEmployeeSheet] = useState<EmployeeSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    const nid = nationalId?.trim();
    if (!nid || !section) return;

    let cancelled = false;

    (async () => {
      try {
        setSheetLoading(true);
        setSheetError(null);

        const cacheKey = `employeeSheet:${section}:${nid}`;
        const cachedRaw = sessionStorage.getItem(cacheKey);

        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as {
            ts: number;
            employee: EmployeeSheet;
          };

          const TEN_MIN = 10 * 60 * 1000;
          if (Date.now() - cached.ts < TEN_MIN) {
            if (!cancelled) {
              setEmployeeSheet(cached.employee);
              setSheetLoading(false);
            }
            return;
          }
        }

        setEmployeeSheet(null);

        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) {
            setSheetError("لم يتم العثور على توكن تسجيل الدخول");
            setSheetLoading(false);
          }
          return;
        }

        const res = await fetch(
          `/api/employee-sheet?nationalId=${encodeURIComponent(
            nid
          )}&section=${encodeURIComponent(section)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();

        if (!res.ok) {
          if (!cancelled) {
            setSheetError(data?.error || "تعذر تحميل بيانات الموظف من الشيت");
          }
          return;
        }

        const employee = (data.employee || {}) as EmployeeSheet;

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ ts: Date.now(), employee })
        );

        if (!cancelled) {
          setEmployeeSheet(employee);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSheetError("حدث خطأ أثناء الاتصال بواجهة Google Sheets");
        }
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nationalId, section]);

  const entries = useMemo(() => {
    if (!employeeSheet) return [];

    return Object.entries(employeeSheet).filter(
      ([k, v]) => k && v && String(v).trim() !== ""
    );
  }, [employeeSheet]);

  const getLabel = (key: string) => {
    return sectionConfig?.fieldLabels?.[key] || key;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{sectionConfig?.title || "بيانات الموظف"}</CardTitle>
        {sectionConfig?.description ? (
          <CardDescription>{sectionConfig.description}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {!nationalId && (
          <div className="text-muted-foreground">
            لا يوجد رقم هوية مخزن في سجل المستخدم.
          </div>
        )}

        {nationalId && (
          <div className="text-xs text-muted-foreground">
            رقم الهوية: <span className="font-semibold">{nationalId}</span>
          </div>
        )}

        {sheetLoading && (
          <div className="text-muted-foreground">
            جاري تحميل البيانات...
          </div>
        )}

        {sheetError && (
          <div className="text-red-600 text-xs">{sheetError}</div>
        )}

        {!sheetLoading && !sheetError && entries.length === 0 && (
          <div className="text-muted-foreground">لا توجد بيانات للعرض.</div>
        )}

        {entries.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {entries.map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground">
                  {getLabel(k)}
                </div>
                <div className="font-medium break-words">{v}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}