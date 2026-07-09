"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SalarySummaryRow = {
  year: string;
  month: string;
  monthKey: string;
  nationalId: string;
  name: string;
  job: string;
  netSalary: number | null;
  basicSalary: number | null;
  workingDays: number | null;
  actualAttendanceDays: number | null;
  attendanceBasedSalary: number | null;
  absenceDeductionAmount: number | null;
  lateDeductionAmount: number | null;
  insuranceDeduction: number | null;
  qorraAllowance: number | null;
  busAllowance: number | null;
  totalAllowances: number | null;
  totalDeductions: number | null;
  notes: string;
};

type SalarySummaryResponse = {
  ok: boolean;
  nationalId: string;
  selected: SalarySummaryRow | null;
  rows: SalarySummaryRow[];
  availablePeriods: {
    year: string;
    month: string;
    monthKey: string;
  }[];
};

const MONTH_LABELS: Record<string, string> = {
  "1": "يناير",
  "2": "فبراير",
  "3": "مارس",
  "4": "أبريل",
  "5": "مايو",
  "6": "يونيو",
  "7": "يوليو",
  "8": "أغسطس",
  "9": "سبتمبر",
  "10": "أكتوبر",
  "11": "نوفمبر",
  "12": "ديسمبر",
};

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";

  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 2,
  }).format(value);
}

function hasPositiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function monthLabel(monthKey: string, fallback: string) {
  return MONTH_LABELS[monthKey] || fallback || "—";
}

export default function EmployeeSalarySummaryPanel({
  nationalId,
}: {
  nationalId?: string | null;
}) {
  const [data, setData] = useState<SalarySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");

  const selected = data?.selected || null;

  const yearOptions = useMemo(() => {
    const set = new Set<string>();

    for (const item of data?.availablePeriods || []) {
      if (item.year) set.add(item.year);
    }

    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [data]);

  const monthOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of data?.availablePeriods || []) {
      if (year !== "all" && item.year !== year) continue;
      if (item.monthKey) map.set(item.monthKey, item.month);
    }

    return Array.from(map.entries()).sort(([a], [b]) => Number(a) - Number(b));
  }, [data, year]);

  useEffect(() => {
    if (year === "all" && month !== "all") {
      setMonth("all");
    }
  }, [year, month]);

  useEffect(() => {
    if (!nationalId) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await auth.currentUser?.getIdToken();

        if (!token) {
          if (!cancelled) {
            setError("لم يتم العثور على توكن تسجيل الدخول");
            setLoading(false);
          }
          return;
        }

        const params = new URLSearchParams();
        params.set("nationalId", nationalId);
        params.set("year", year);

        if (year !== "all" && month !== "all") {
          params.set("month", month);
        }

        const res = await fetch(`/api/salary-summary?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await res.json();

        if (!res.ok) {
          if (!cancelled) {
            setError(json?.error || "تعذر تحميل كشف الراتب");
          }
          return;
        }

        if (!cancelled) {
          setData(json as SalarySummaryResponse);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("حدث خطأ أثناء تحميل كشف الراتب");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nationalId, year, month]);

  return (
    <div className="grid gap-4">
      <Card className="border-emerald-200 bg-emerald-50">
        <CardHeader>
          <CardTitle>صافي راتبك</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-3xl font-bold text-emerald-900">
            {loading ? "..." : formatCurrency(selected?.netSalary)}
          </div>

          <div className="text-sm text-emerald-900/80">
            {selected
              ? `كشف راتب شهر ${monthLabel(selected.monthKey, selected.month)} ${selected.year}`
              : "اختر الشهر والسنة لعرض كشف الراتب."}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">الشهر</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الشهر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشهور</SelectItem>
                {monthOptions.map(([monthKey, label]) => (
                  <SelectItem key={monthKey} value={monthKey}>
                    {monthLabel(monthKey, label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMonth("all");
              }}
            >
              إعادة الضبط
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && !selected && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            لا يوجد كشف راتب متاح لهذا الموظف حتى الآن.
          </CardContent>
        </Card>
      )}

      {selected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>بيانات الموظف</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <InfoItem label="الاسم" value={selected.name || "—"} />
              <InfoItem label="الوظيفة" value={selected.job || "—"} />
              <InfoItem
                label="السجل المدني"
                value={selected.nationalId || nationalId || "—"}
              />
              <InfoItem
                label="الفترة"
                value={`${monthLabel(selected.monthKey, selected.month)} ${selected.year}`}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SalaryCard
              title="الراتب الأساسي"
              value={formatCurrency(selected.basicSalary)}
              className="border-blue-200 bg-blue-50"
            />

            <SalaryCard
              title="مستحق حسب الحضور"
              value={formatCurrency(selected.attendanceBasedSalary)}
              className="border-emerald-200 bg-emerald-50"
            />

            {hasPositiveAmount(selected.totalAllowances) && (
              <SalaryCard
                title="إجمالي البدلات"
                value={formatCurrency(selected.totalAllowances)}
                className="border-violet-200 bg-violet-50"
              />
            )}

            {hasPositiveAmount(selected.totalDeductions) && (
              <SalaryCard
                title="إجمالي الخصومات"
                value={formatCurrency(selected.totalDeductions)}
                className="border-red-200 bg-red-50"
              />
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>تفاصيل الحساب</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <DetailItem
                  label="أيام العمل في الشهر"
                  value={formatNumber(selected.workingDays)}
                />

                <DetailItem
                  label="أيام الحضور الفعلي"
                  value={formatNumber(selected.actualAttendanceDays)}
                />

                {hasPositiveAmount(selected.absenceDeductionAmount) && (
                  <DetailItem
                    label="مبلغ خصم الغياب"
                    value={formatCurrency(selected.absenceDeductionAmount)}
                  />
                )}

                {hasPositiveAmount(selected.lateDeductionAmount) && (
                  <DetailItem
                    label="مبلغ خصم التأخر"
                    value={formatCurrency(selected.lateDeductionAmount)}
                  />
                )}

                {hasPositiveAmount(selected.insuranceDeduction) && (
                  <DetailItem
                    label="خصم التأمينات"
                    value={formatCurrency(selected.insuranceDeduction)}
                  />
                )}

                {hasPositiveAmount(selected.qorraAllowance) && (
                  <DetailItem
                    label="بدل برنامج قرة"
                    value={formatCurrency(selected.qorraAllowance)}
                  />
                )}

                {hasPositiveAmount(selected.busAllowance) && (
                  <DetailItem
                    label="بدل الباص"
                    value={formatCurrency(selected.busAllowance)}
                  />
                )}

                {hasPositiveAmount(selected.totalAllowances) && (
                  <DetailItem
                    label="إجمالي البدلات"
                    value={formatCurrency(selected.totalAllowances)}
                  />
                )}

                {hasPositiveAmount(selected.totalDeductions) && (
                  <DetailItem
                    label="إجمالي الخصومات"
                    value={formatCurrency(selected.totalDeductions)}
                  />
                )}
              </div>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                مبلغ خصم الغياب ظاهر للتوضيح فقط، لأن مبلغ الراتب المستحق حسب
                الحضور محسوب بالفعل بناءً على أيام الحضور الفعلي.
              </div>

              {selected.notes && (
                <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm">
                  <div className="mb-1 font-medium">ملاحظات</div>
                  <div className="text-muted-foreground">{selected.notes}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words font-medium">{value}</div>
    </div>
  );
}

function SalaryCard({
  title,
  value,
  className = "",
}: {
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-xl border shadow-sm", className)}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="mt-2 break-words text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 break-words font-semibold">{value}</div>
    </div>
  );
}
