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
import { cn } from "@/lib/utils";

type EmployeeInfo = {
  nationalId: string;
  name: string;
  job: string;
  email: string;
  salary: number | null;
  dailySalary: number | null;
  perMinuteSalary: number | null;
  insuranceDeduction: number | null;
};

type DisciplinarySummary = {
  totalEvents: number;
  totalTypes: number;
  latestDate: string | null;
  totalValue: number;
  countsByType: Record<string, number>;
};

type DisciplinaryEvent = {
  nationalId: string;
  name: string;
  job: string;
  eventType: string;
  eventDescription: string;
  value: number | null;
  eventDate: string;
  contractYear: string;
  deductionAmount: number | null;
  penalty: string;
  penaltyAmount: number | null;
  adminAction: string;
  ruleCode: string;
  repetitionInContractYear: string;
  byLawText: string;
  eventKey: string;
  repetitionKey: string;
  processingStatus: string;
  email: string;
  notificationSent: string;
  sentAt: string;
  sendNote: string;
};

type DisciplinaryEventsResponse = {
  ok: boolean;
  nationalId: string;
  employee: EmployeeInfo;
  summary: DisciplinarySummary;
  events: DisciplinaryEvent[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ar-SA");
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";

  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years: string[] = ["all"];
  for (let y = currentYear; y >= currentYear - 2; y -= 1) {
    years.push(String(y));
  }
  return years;
}

function repeatLabel(value: string | null | undefined) {
  const n = Number(value || 0);
  if (!n) return "—";
  if (n === 1) return "أول مرة";
  if (n === 2) return "ثاني مرة";
  if (n === 3) return "ثالث مرة";
  if (n === 4) return "رابع مرة";
  return `${n} مرة`;
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

export default function EmployeeDisciplinaryEventsPanel({
  nationalId,
}: {
  nationalId?: string | null;
}) {
  const [data, setData] = useState<DisciplinaryEventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [processingStatus, setProcessingStatus] = useState<string>("all");

  const yearOptions = useMemo(() => getYearOptions(), []);
  const events = useMemo(() => data?.events || [], [data]);

  const eventTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of events) {
      if (item.eventType) set.add(item.eventType);
    }
    return Array.from(set);
  }, [events]);

  const processingStatusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of events) {
      if (item.processingStatus) set.add(item.processingStatus);
    }
    return Array.from(set);
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

        if (eventType !== "all") {
          params.set("eventType", eventType);
        }

        if (processingStatus !== "all") {
          params.set("processingStatus", processingStatus);
        }

        const res = await fetch(
          `/api/disciplinary-events?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const json = await res.json();

        if (!res.ok) {
          if (!cancelled) {
            setError(json?.error || "تعذر تحميل سجل الجزاءات");
          }
          return;
        }

        if (!cancelled) {
          setData(json as DisciplinaryEventsResponse);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("حدث خطأ أثناء تحميل سجل الجزاءات");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nationalId, year, month, eventType, processingStatus]);

  useEffect(() => {
    if (year === "all" && month !== "all") {
      setMonth("all");
    }
  }, [year, month]);

  const employee = data?.employee;
  const summary = data?.summary;

  return (
    <div className="grid gap-4">
      {" "}
      <Card>
        {" "}
        <CardHeader>
          {" "}
          <CardTitle>بيانات الموظف</CardTitle>{" "}
        </CardHeader>{" "}
        <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <InfoItem label="الاسم" value={employee?.name || "—"} />
          <InfoItem label="الوظيفة" value={employee?.job || "—"} />
          <InfoItem
            label="السجل المدني"
            value={employee?.nationalId || nationalId || "—"}
          />
          <InfoItem label="البريد الإلكتروني" value={employee?.email || "—"} />{" "}
          <InfoItem label="الراتب" value={formatCurrency(employee?.salary)} />{" "}
          {/* <InfoItem
            label="الراتب اليومي"
            value={formatCurrency(employee?.dailySalary)}
          />{" "}
          <InfoItem
            label="الراتب بالدقيقة"
            value={formatCurrency(employee?.perMinuteSalary)}
          />{" "} */}
          <InfoItem
            label="خصم التأمينات"
            value={formatCurrency(employee?.insuranceDeduction)}
          />{" "}
        </CardContent>{" "}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">الشهر</div>
            <Select value={month} onValueChange={setMonth}>
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
            <div className="text-xs text-muted-foreground">نوع الحدث</div>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {eventTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">حالة المعالجة</div>
            <Select
              value={processingStatus}
              onValueChange={setProcessingStatus}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {processingStatusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
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
                setEventType("all");
                setProcessingStatus("all");
              }}
            >
              إعادة الضبط
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="إجمالي الأحداث"
          value={loading ? "..." : String(summary?.totalEvents ?? "—")}
          className="border-blue-200 bg-blue-50"
        />

        <StatCard
          title="أنواع الأحداث"
          value={loading ? "..." : String(summary?.totalTypes ?? "—")}
          className="border-violet-200 bg-violet-50"
        />

        <StatCard
          title="آخر تاريخ"
          value={loading ? "..." : formatDate(summary?.latestDate)}
          className="border-amber-200 bg-amber-50"
        />

        <StatCard
          title="إجمالي الخصومات"
          value={loading ? "..." : formatCurrency(summary?.totalValue ?? null)}
          className="border-emerald-200 bg-emerald-50"
        />
      </div>
      <Card className="max-w-full overflow-hidden">
        <CardHeader>
          <CardTitle>سجل الجزاءات</CardTitle>
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
              لا توجد أي إجازات مسجلة للموظف خلال السنة العقدية
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="space-y-2">
              <div className="w-full overflow-x-auto rounded-xl border touch-pan-x [-webkit-overflow-scrolling:touch]">
                <div className="min-w-max">
                  <table className="w-full overflow-x-auto rounded-xl text-sm">
                    <thead className="bg-muted/50">
                      <tr className="border-b">
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          التاريخ
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          نوع الحدث
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          الوصف
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          التكرار
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          حسب اللائحة
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          الحسم
                        </th>
                        {/* <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      الجزاء
                    </th> */}
                        {/* <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      الإجراء الإداري
                    </th> */}
                      </tr>
                    </thead>

                    <tbody>
                      {events.map((event, index) => (
                        <tr
                          key={`${event.eventKey}-${event.repetitionKey}-${index}`}
                          className={`align-top border-b last:border-b-0 ${eventRowClass(
                            event.eventType,
                          )}`}
                        >
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatDate(event.eventDate)}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2">
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs ${eventTypeBadgeClass(
                                event.eventType,
                              )}`}
                            >
                              {event.eventType || "—"}
                            </span>
                          </td>

                          <td className="whitespace-pre-wrap break-words px-3 py-2">
                            {event.eventDescription || "—"}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2">
                            {repeatLabel(event.repetitionInContractYear)}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2">
                            {event.byLawText || "—"}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2">
                            {event.deductionAmount || "—"}
                          </td>

                          {/* <td className="whitespace-nowrap px-3 py-2">
                        {event.penalty || "—"}
                      </td> */}

                          {/* <td className="whitespace-nowrap px-3 py-2">
                        {event.adminAction || "—"}
                      </td> */}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
      {" "}
      <div className="text-xs text-muted-foreground">{label}</div>{" "}
      <div className="break-words font-medium">{value}</div>{" "}
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
    <Card className={cn("rounded-xl border p-4 shadow-sm", className)}>
      {" "}
      <CardContent className="p-1">
        {" "}
        <div className="text-xs text-muted-foreground">{title}</div>{" "}
        <div className="mt-2 break-words text-xl font-bold text-violet-900">
          {value}{" "}
        </div>{" "}
      </CardContent>{" "}
    </Card>
  );
}

function eventTypeBadgeClass(type: string) {
  const t = String(type || "").trim();

  if (t.includes("غياب")) return "border-red-200 bg-red-100 text-red-800";
  if (t.includes("تأخر")) return "border-amber-200 bg-amber-100 text-amber-800";
  if (t.includes("مخالفة"))
    return "border-violet-200 bg-violet-100 text-violet-800";
  if (t.includes("إنذار")) return "border-blue-200 bg-blue-100 text-blue-800";

  return "border-border bg-muted text-foreground";
}

function eventRowClass(type: string) {
  const t = String(type || "").trim();

  if (t.includes("غياب")) return "bg-red-50/60";
  if (t.includes("تأخر")) return "bg-amber-50/60";
  if (t.includes("مخالفة")) return "bg-violet-50/60";
  if (t.includes("إنذار")) return "bg-blue-50/60";

  return "";
}
