"use client";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export type LeaveEvent = {
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ar-SA");
}

function leaveTypeBadgeClass(type: string) {
  const t = String(type || "").trim();

  if (t.includes("بدون عذر")) {
    return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900";
  }

  if (t.includes("بعذر رسمي")) {
    return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900";
  }

  if (t.includes("بعذر مقبول")) {
    return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900";
  }

  if (t.includes("اضطراري")) {
    return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900";
  }

  if (t.includes("سنوية")) {
    return "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900";
  }

  if (t.includes("وضع")) {
    return "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-900";
  }

  if (t.includes("مرض") || t.includes("صحي")) {
    return "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-900";
  }

  return "bg-muted text-foreground border-border";
}

function leaveRowClass(type: string) {
  const t = String(type || "").trim();

  if (t.includes("بدون عذر")) return "bg-red-50/60 dark:bg-red-950/10";
  if (t.includes("بعذر رسمي")) return "bg-blue-50/60 dark:bg-blue-950/10";
  if (t.includes("بعذر مقبول"))
    return "bg-emerald-50/60 dark:bg-emerald-950/10";
  if (t.includes("اضطراري")) return "bg-amber-50/60 dark:bg-amber-950/10";
  if (t.includes("سنوية")) return "bg-violet-50/60 dark:bg-violet-950/10";
  if (t.includes("وضع")) return "bg-pink-50/60 dark:bg-pink-950/10";
  if (t.includes("مرض") || t.includes("صحي")) {
    return "bg-cyan-50/60 dark:bg-cyan-950/10";
  }

  return "";
}

export default function EmployeeLeaveEventsTable({
  events,
}: {
  events: LeaveEvent[];
}) {
  return (
    <div dir="rtl" className="space-y-3 text-right">
      <div className="overflow-hidden rounded-xl border">
        <ScrollArea dir="rtl" type="always" className="w-full">
          <div className="min-w-max">
            <table className="min-w-[1100px] text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-right font-medium">اليوم</th>
                  <th className="px-3 py-2 text-right font-medium">
                    نوع الإجازة
                  </th>
                  <th className="px-3 py-2 text-right font-medium">الشهر</th>
                  <th className=" px-3 py-2 text-right font-medium">المصدر</th>
                  <th className="px-3 py-2 text-right font-medium">الوصف</th>
                  <th className=" px-3 py-2 text-right font-medium">
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
                    <td className="px-3 py-2 text-right">
                      {formatDate(event.eventDate)}
                    </td>

                    <td className="px-3 py-2 text-right">
                      {event.dayName || "—"}
                    </td>

                    <td className="px-3 py-2 text-right">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs  ${leaveTypeBadgeClass(
                          event.leaveType,
                        )}`}
                      >
                        {event.leaveType || "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-right">
                      {event.monthLabel || "—"}
                    </td>

                    <td className="px-3 py-2 text-right">
                      {event.source || "—"}
                    </td>

                    <td className="px-3 py-2 text-right">
                      {event.description || "—"}
                    </td>

                    <td className="px-3 py-2 text-right">
                      {event.fullNote || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
