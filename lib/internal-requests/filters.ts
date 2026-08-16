// lib/internal-requests/filters.ts
import type { InternalRequest, RequestStatus } from "@/lib/internal-requests/types";

export type InboxKindFilter = "all" | "primary" | "cc";

export type RequestsFilters = {
  status: RequestStatus | "all";
  inboxKind: InboxKindFilter; // يستخدم فقط في inbox
  dateFrom: string; // "YYYY-MM-DD" أو ""
  dateTo: string;   // "YYYY-MM-DD" أو ""
};

export const defaultRequestsFilters: RequestsFilters = {
  status: "all",
  inboxKind: "all",
  dateFrom: "",
  dateTo: "",
};

function dateAtStartOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateAtEndOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateInput(v: string): Date | null {
  // v = "YYYY-MM-DD"
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function applyRequestFilters(
  items: InternalRequest[],
  filters: RequestsFilters,
  opts?: {
    mode?: "inbox" | "outbox" | "archive";
    myRecipientKey?: string | null;
    myUid?: string | null;
  }
) {
  const mode = opts?.mode ?? "outbox";
  const myKey = opts?.myRecipientKey ?? null;
  const myUid = opts?.myUid ?? null;

  const fromD = parseDateInput(filters.dateFrom);
  const toD = parseDateInput(filters.dateTo);

  const fromMs = fromD ? dateAtStartOfDay(fromD).getTime() : null;
  const toMs = toD ? dateAtEndOfDay(toD).getTime() : null;

  return items.filter((r) => {
    // status
    if (filters.status !== "all" && r.status !== filters.status) return false;

    // date range (createdAt)
    const createdMs = r.createdAt ? r.createdAt.getTime() : null;
    if (fromMs != null && (createdMs == null || createdMs < fromMs)) return false;
    if (toMs != null && (createdMs == null || createdMs > toMs)) return false;

    // inbox kind (primary/cc)
    if (mode === "inbox" && filters.inboxKind !== "all") {
      const data = r as any;
      const hasCanonicalAssignee =
        typeof data.currentAssigneeUid === "string" && !!data.currentAssigneeUid;
      const hasCanonicalCc = Array.isArray(data.ccUids);
      const isPrimary = hasCanonicalAssignee
        ? data.currentAssigneeUid === myUid
        : !!myKey && data.currentAssigneeKey === myKey;
      const isCc = hasCanonicalCc
        ? !!myUid && data.ccUids.includes(myUid)
        : !!myKey &&
          Array.isArray(data.ccRecipientKeys) &&
          data.ccRecipientKeys.includes(myKey);

      if (filters.inboxKind === "primary" && !isPrimary) return false;
      if (filters.inboxKind === "cc" && !isCc) return false;
    }

    return true;
  });
}
