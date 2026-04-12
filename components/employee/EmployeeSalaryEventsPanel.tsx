"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EventType = "delay" | "absence" | "fingerprint";

type SalaryEmployee = {
  nationalId: string;
  name: string;
  job: string;
  salary: number | string;
  insuranceDeduction: number | string;
};

type SalarySummary = {
  totalEvents: number;
  delayCount: number;
  absenceCount: number;
  fingerprintCount: number;
  totalDelayMinutes: number;
  totalDeduction: number;
};

type SalaryEvent = {
  nationalId: string;
  name: string;
  job: string;
  eventType: EventType | string;
  eventLabel: string;
  eventValue: number | string;
  eventDate: string;
  deduction: number | string;
  penalty: string;
  eventKey: string;
};

type SalaryEventsResponse = {
  ok: boolean;
  nationalId: string;
  employee: SalaryEmployee;
  summary: SalarySummary;
  events: SalaryEvent[];
  filters?: {
    type?: string | null;
    months?: string | null;
    year?: string | null;
    month?: string | null;
    from?: string | null;
    to?: string | null;
    mode?: string | null;
  };
};

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isFinite(n)) {
    return new Intl.NumberFormat("ar-SA").format(n);
  }
  return String(value);
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isFinite(n)) {
    return `${new Intl.NumberFormat("ar-SA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n)} ر.س`;
  }
  return String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ar-SA");
}

function typeLabel(type: string) {
  if (type === "delay") return "تأخر";
  if (type === "absence") return "غياب";
  if (type === "fingerprint") return "نسيان بصمة";
  return type || "—";
}

function valueLabel(event: SalaryEvent) {
  if (event.eventType === "delay") {
    return event.eventValue !== ""
      ? `${formatNumber(event.eventValue)} دقيقة`
      : "—";
  }
  if (event.eventType === "absence") {
    return event.eventValue !== ""
      ? `${formatNumber(event.eventValue)} يوم`
      : "—";
  }
  if (event.eventType === "fingerprint") {
    return event.eventValue !== "" ? String(event.eventValue) : "—";
  }
  return event.eventValue !== "" ? String(event.eventValue) : "—";
}

function badgeClass(type: string) {
  if (type === "delay") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (type === "absence") {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (type === "fingerprint") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  return "bg-muted text-foreground border-border";
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years: string[] = ["all"];
  for (let y = currentYear; y >= currentYear - 5; y -= 1) {
    years.push(String(y));
  }
  return years;
}

const MONTH_OPTIONS = [
  { value: "1", label: "يناير" },
  { value: "2", label: "فبراير" },
  { value: "3", label: "مارس" },
  { value: "4", label: "أبريل" },
  { value: "5", label: "مايو" },
  { value: "6", label: "يونيو" },
  { value: "7", label: "يوليو" },
  { value: "8", label: "أغسطس" },
  { value: "9", label: "سبتمبر" },
  { value: "10", label: "أكتوبر" },
  { value: "11", label: "نوفمبر" },
  { value: "12", label: "ديسمبر" },
];

export default function EmployeeSalaryEventsPanel({
  nationalId,
}: {
  nationalId?: string | null;
}) {
  const [data, setData] = useState<SalaryEventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");

  const yearOptions = useMemo(() => getYearOptions(), []);

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

        if (type !== "all") {
          params.set("type", type);
        }

        if (year !== "all") {
          params.set("year", year);
        }

        if (month !== "all") {
          params.set("month", month);
        }

        const res = await fetch(`/api/salary-events?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = (await res.json()) as
          | SalaryEventsResponse
          | { error?: string };

        if (!res.ok) {
          if (!cancelled) {
            setError(
              (json as { error?: string })?.error ||
                "تعذر تحميل الحركات والخصومات",
            );
          }
          return;
        }

        if (!cancelled) {
          setData(json as SalaryEventsResponse);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("حدث خطأ أثناء تحميل الحركات والخصومات");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nationalId, type, year, month]);

  const employee = data?.employee;
  const summary = data?.summary;
  const events = useMemo(() => data?.events || [], [data]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>بيانات الموظف</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 text-sm">
          <InfoItem label="الاسم" value={employee?.name || "—"} />
          <InfoItem label="الوظيفة" value={employee?.job || "—"} />
          <InfoItem
            label="السجل المدني"
            value={employee?.nationalId || nationalId || "—"}
          />
          <InfoItem label="الراتب" value={formatMoney(employee?.salary)} />
          <InfoItem
            label="خصم التأمينات"
            value={formatMoney(employee?.insuranceDeduction)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">نوع الحركة</div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="delay">تأخر</SelectItem>
                <SelectItem value="absence">غياب</SelectItem>
                <SelectItem value="fingerprint">نسيان بصمة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">السنة</div>
            <Select
              value={year}
              onValueChange={(value) => {
                setYear(value);
                if (value === "all") {
                  setMonth("all");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر السنة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل السنوات</SelectItem>
                {yearOptions
                  .filter((y) => y !== "all")
                  .map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">الشهر</div>
            <Select
              value={month}
              onValueChange={setMonth}
              disabled={year === "all"}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={year === "all" ? "اختر سنة أولًا" : "اختر الشهر"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشهور</SelectItem>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
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
                setType("all");
                setYear("all");
                setMonth("all");
              }}
            >
              إعادة الضبط
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          title="إجمالي الحركات"
          value={loading ? "..." : formatNumber(summary?.totalEvents)}
        />
        <StatCard
          title="مرات التأخر"
          value={loading ? "..." : formatNumber(summary?.delayCount)}
        />
        <StatCard
          title="مرات الغياب"
          value={loading ? "..." : formatNumber(summary?.absenceCount)}
        />
        <StatCard
          title="نسيان البصمة"
          value={loading ? "..." : formatNumber(summary?.fingerprintCount)}
        />
        <StatCard
          title="مجموع دقائق التأخر"
          value={loading ? "..." : formatNumber(summary?.totalDelayMinutes)}
        />
        <StatCard
          title="إجمالي الخصومات"
          value={loading ? "..." : formatMoney(summary?.totalDeduction)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل الحركات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!nationalId && (
            <div className="text-sm text-muted-foreground">
              لا يوجد رقم هوية مخزن للمستخدم.
            </div>
          )}

          {loading && (
            <div className="text-sm text-muted-foreground">
              جاري تحميل البيانات...
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          {!loading && !error && events.length === 0 && (
            <div className="text-sm text-muted-foreground">
              لا توجد حركات ضمن الفلاتر الحالية.
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-right font-medium">
                      التاريخ
                    </th>
                    <th className="px-3 py-2 text-right font-medium">النوع</th>
                    <th className="px-3 py-2 text-right font-medium">البيان</th>
                    <th className="px-3 py-2 text-right font-medium">القيمة</th>
                    <th className="px-3 py-2 text-right font-medium">الخصم</th>
                    <th className="px-3 py-2 text-right font-medium">الجزاء</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr
                      key={`${event.eventKey || event.eventDate}-${index}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        {formatDate(event.eventDate)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs ${badgeClass(
                            event.eventType,
                          )}`}
                        >
                          {typeLabel(event.eventType)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{event.eventLabel || "—"}</td>
                      <td className="px-3 py-2">{valueLabel(event)}</td>
                      <td className="px-3 py-2">
                        {formatMoney(event.deduction)}
                      </td>
                      <td className="px-3 py-2">{event.penalty || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
