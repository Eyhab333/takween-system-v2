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

type LeaveEmployee = {
  nationalId: string;
  name: string;
  job: string;
};

type LeaveSummary = {
  totalEvents: number;
  totalTypes: number;
  latestDate: string | null;
  countsByType: Record<string, number>;
};

type LeaveEvent = {
  monthLabel: string;
  name: string;
  job: string;
  nationalId: string;
  leaveType: string;
  dayName: string;
  eventDate: string;
  source: string;
  description: string;
  fullNote: string;
};

type LeaveEventsResponse = {
  ok: boolean;
  nationalId: string;
  employee: LeaveEmployee;
  summary: LeaveSummary;
  events: LeaveEvent[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ar-SA");
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years: string[] = ["all"];
  for (let y = currentYear; y >= currentYear - 1; y -= 1) {
    years.push(String(y));
  }
  return years;
}

const MONTH_OPTIONS = [
  { value: "all", label: "كل الشهور" },
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

export default function EmployeeLeaveEventsPanel({
  nationalId,
}: {
  nationalId?: string | null;
}) {
  const [data, setData] = useState<LeaveEventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [leaveType, setLeaveType] = useState<string>("all");

  const yearOptions = useMemo(() => getYearOptions(), []);
  const events = useMemo(() => data?.events || [], [data]);

  const leaveTypeOptions = useMemo(() => {
    const map = new Set<string>();
    for (const item of events) {
      if (item.leaveType) map.add(item.leaveType);
    }
    return Array.from(map);
  }, [events]);

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

        if (leaveType !== "all") {
          params.set("leaveType", leaveType);
        }

        const res = await fetch(`/api/leave-events?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await res.json();

        if (!res.ok) {
          if (!cancelled) {
            setError(json?.error || "تعذر تحميل سجل الإجازات");
          }
          return;
        }

        if (!cancelled) {
          setData(json as LeaveEventsResponse);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("حدث خطأ أثناء تحميل سجل الإجازات");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nationalId, year, month, leaveType]);

  useEffect(() => {
    if (year === "all" && month !== "all") {
      setMonth("all");
    }
  }, [year, month]);

  const employee = data?.employee;
  const summary = data?.summary;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>بيانات الموظف</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <InfoItem label="الاسم" value={employee?.name || "—"} />
          <InfoItem label="الوظيفة" value={employee?.job || "—"} />
          <InfoItem
            label="السجل المدني"
            value={employee?.nationalId || nationalId || "—"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">السنة</div>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="اختر السنة" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y === "all" ? "كل السنوات" : y}
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
                <SelectValue placeholder="اختر الشهر" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">نوع الإجازة</div>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger>
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {leaveTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
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
                setYear("all");
                setMonth("all");
                setLeaveType("all");
              }}
            >
              إعادة الضبط
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="إجمالي السجلات"
          value={loading ? "..." : String(summary?.totalEvents ?? "—")}
          className="border-blue-200 bg-blue-50"
        />

        <StatCard
          title="أنواع الإجازات"
          value={loading ? "..." : String(summary?.totalTypes ?? "—")}
          className="border-violet-200 bg-violet-50"
        />

        <StatCard
          title="آخر تاريخ"
          value={loading ? "..." : formatDate(summary?.latestDate)}
          className="border-amber-200 bg-amber-50"
        />

        <StatCard
          title="أكثر نوع"
          value={
            loading ? "..." : mostFrequentType(summary?.countsByType || {})
          }
          className="border-emerald-200 bg-emerald-50"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل الإجازات</CardTitle>
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
              لا توجد سجلات ضمن الفلاتر الحالية.
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-right font-medium">
                      التاريخ
                    </th>
                    <th className="px-3 py-2 text-right font-medium">اليوم</th>
                    <th className="px-3 py-2 text-right font-medium">
                      نوع الإجازة
                    </th>
                    <th className="px-3 py-2 text-right font-medium">الشهر</th>
                    <th className="px-3 py-2 text-right font-medium">المصدر</th>
                    <th className="px-3 py-2 text-right font-medium">الوصف</th>
                    <th className="px-3 py-2 text-right font-medium">
                      الملاحظة كاملة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr
                      key={`${event.eventDate}-${event.leaveType}-${index}`}
                      className={`border-b last:border-b-0 align-top ${leaveRowClass(event.leaveType)}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(event.eventDate)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {event.dayName || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs ${leaveTypeBadgeClass(
                            event.leaveType,
                          )}`}
                        >
                          {event.leaveType || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {event.monthLabel || "—"}
                      </td>
                      <td className="px-3 py-2">{event.source || "—"}</td>
                      <td className="px-3 py-2">{event.description || "—"}</td>
                      <td className="px-3 py-2 whitespace-pre-wrap">
                        {event.fullNote || "—"}
                      </td>
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

function mostFrequentType(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (!entries.length) return "—";
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] || "—";
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function StatCard({
  title,
  value,
  className = "",
}: {
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="mt-2 text-2xl font-bold break-words">{value}</div>
      </CardContent>
    </Card>
  );
}

function leaveTypeBadgeClass(type: string) {
  const t = String(type || "").trim();

  if (t.includes("بدون عذر")) {
    return "bg-red-100 text-red-800 border-red-200";
  }

  if (t.includes("بعذر رسمي")) {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }

  if (t.includes("بعذر مقبول")) {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }

  if (t.includes("اضطراري")) {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }

  if (t.includes("سنوية")) {
    return "bg-violet-100 text-violet-800 border-violet-200";
  }

  if (t.includes("وضع")) {
    return "bg-pink-100 text-pink-800 border-pink-200";
  }

  if (t.includes("مرض") || t.includes("صحي")) {
    return "bg-cyan-100 text-cyan-800 border-cyan-200";
  }

  return "bg-muted text-foreground border-border";
}

function leaveRowClass(type: string) {
  const t = String(type || "").trim();

  if (t.includes("بدون عذر")) return "bg-red-50/60";
  if (t.includes("بعذر رسمي")) return "bg-blue-50/60";
  if (t.includes("بعذر مقبول")) return "bg-emerald-50/60";
  if (t.includes("اضطراري")) return "bg-amber-50/60";
  if (t.includes("سنوية")) return "bg-violet-50/60";
  if (t.includes("وضع")) return "bg-pink-50/60";
  if (t.includes("مرض") || t.includes("صحي")) return "bg-cyan-50/60";

  return "";
}
