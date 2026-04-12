export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { google } from "googleapis";
import admin from "firebase-admin";

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

type EmployeeInfo = {
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

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

const LEAVE_SHEET = {
  spreadsheetId:
    process.env.GOOGLE_SHEET_ID_SALARY_LEAVE ||
    process.env.GOOGLE_SHEET_ID ||
    "",
  sheetName: "ملخص_الملاحظات",
  range: "A:J",
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL;

  const privateKey =
    (process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "")
      .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin env is missing");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeSheetName(name: string) {
  return name.replace(/'/g, "''");
}

function toIsoDateString(value: unknown): string | null {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]") {
    const d = value as Date;
    if (Number.isNaN(d.getTime())) return null;
    return formatDateOnly(d);
  }

  const s = normalizeDigits(String(value));
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateOnly(d);
}

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function formatDateOnly(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function endOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function startOfYear(year: number): string {
  return `${year}-01-01`;
}

function endOfYear(year: number): string {
  return `${year}-12-31`;
}

function subtractMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

function resolveDateWindow(searchParams: URLSearchParams): {
  from: string | null;
  to: string | null;
  mode: string;
} {
  const range = normalizeText(searchParams.get("range")).toLowerCase();
  const fromParam = toIsoDateString(searchParams.get("from"));
  const toParam = toIsoDateString(searchParams.get("to"));

  const rawYear = normalizeText(searchParams.get("year")).toLowerCase();
  const rawMonth = normalizeText(searchParams.get("month")).toLowerCase();

  const yearParam = rawYear && rawYear !== "all" ? Number(rawYear) : NaN;
  const monthParam = rawMonth && rawMonth !== "all" ? Number(rawMonth) : NaN;
  const monthsParam = Number(searchParams.get("months") || "");

  if (range === "all" || rawYear === "all") {
    return { from: null, to: null, mode: "all" };
  }

  if (fromParam || toParam) {
    return {
      from: fromParam || null,
      to: toParam || null,
      mode: "custom",
    };
  }

  if (
    Number.isFinite(yearParam) &&
    yearParam >= 2000 &&
    yearParam <= 3000 &&
    Number.isFinite(monthParam) &&
    monthParam >= 1 &&
    monthParam <= 12
  ) {
    return {
      from: startOfMonth(yearParam, monthParam),
      to: endOfMonth(yearParam, monthParam),
      mode: "month",
    };
  }

  if (Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= 3000) {
    return {
      from: startOfYear(yearParam),
      to: endOfYear(yearParam),
      mode: "year",
    };
  }

  const months =
    Number.isFinite(monthsParam) && monthsParam > 0 ? monthsParam : 24;

  const now = new Date();
  return {
    from: formatDateOnly(subtractMonths(now, months)),
    to: formatDateOnly(now),
    mode: "months",
  };
}

function inDateWindow(
  isoDate: string | null,
  from: string | null,
  to: string | null
) {
  if (!isoDate) return false;
  if (from && isoDate < from) return false;
  if (to && isoDate > to) return false;
  return true;
}

function buildEmployeeInfo(events: LeaveEvent[], nationalId: string): EmployeeInfo {
  const first = events[0];
  return {
    nationalId,
    name: first?.name || "—",
    job: first?.job || "—",
  };
}

function buildSummary(events: LeaveEvent[]): LeaveSummary {
  const countsByType: Record<string, number> = {};
  let latestDate: string | null = null;

  for (const event of events) {
    const key = event.leaveType || "غير محدد";
    countsByType[key] = (countsByType[key] || 0) + 1;

    if (event.eventDate && (!latestDate || event.eventDate > latestDate)) {
      latestDate = event.eventDate;
    }
  }

  return {
    totalEvents: events.length,
    totalTypes: Object.keys(countsByType).length,
    latestDate,
    countsByType,
  };
}

async function getRequester(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1];

  if (!idToken) return null;

  const app = getAdminApp();
  const decoded = await app.auth().verifyIdToken(idToken);

  return {
    uid: decoded.uid,
    role: (decoded.role as string | undefined) || "employee",
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!LEAVE_SHEET.spreadsheetId) {
      return Response.json(
        { error: "بيئة Google Service Account أو Spreadsheet ID غير مكتملة" },
        { status: 500 }
      );
    }

    const requester = await getRequester(req);
    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const nationalId = normalizeText(searchParams.get("nationalId"));
    const leaveTypeFilter = normalizeText(searchParams.get("leaveType"));
    const limit = Number(searchParams.get("limit") || "0");
    const dateWindow = resolveDateWindow(searchParams);

    if (!nationalId) {
      return Response.json({ error: "nationalId مطلوب" }, { status: 400 });
    }

    const isHrOrAbove = HR_ROLES.includes(requester.role as any);

    if (!isHrOrAbove) {
      const app = getAdminApp();
      const userSnap = await app.firestore().doc(`users/${requester.uid}`).get();

      if (!userSnap.exists) {
        return Response.json(
          { error: "Requester user doc not found" },
          { status: 403 }
        );
      }

      const userData = userSnap.data() as Record<string, unknown>;
      const personalInfo =
        (userData.personalInfo as Record<string, unknown> | undefined) || {};

      const myNationalId = String(
        personalInfo.nationalId || userData.nationalId || ""
      ).trim();

      if (myNationalId !== nationalId) {
        return Response.json(
          { error: "Forbidden: nationalId لا يطابق حسابك" },
          { status: 403 }
        );
      }
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey) {
      return Response.json(
        { error: "بيئة Google Service Account أو Spreadsheet ID غير مكتملة" },
        { status: 500 }
      );
    }

    const gAuth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth: gAuth });

    const range = `'${escapeSheetName(LEAVE_SHEET.sheetName)}'!${LEAVE_SHEET.range}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: LEAVE_SHEET.spreadsheetId,
      range,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) {
      return Response.json(
        { error: "لا توجد بيانات كافية في الشيت" },
        { status: 404 }
      );
    }

    const headers = rows[0].map((h) => normalizeText(h));
    const dataRows = rows.slice(1);

    const indexOf = (name: string) => headers.indexOf(normalizeText(name));

    const monthIdx = indexOf("الشهر");
    const nameIdx = indexOf("اسم الموظف");
    const jobIdx = indexOf("الوظيفة");
    const nationalIdIdx = indexOf("السجل المدني");
    const leaveTypeIdx = indexOf("نوع الإجازة");
    const dayIdx = indexOf("اليوم");
    const eventDateIdx = indexOf("تاريخ اليوم");
    const sourceIdx = indexOf("المصدر");
    const descIdx = indexOf("الوصف");
    const fullNoteIdx = indexOf("الملاحظة كاملة");

    const required = [
      monthIdx,
      nameIdx,
      jobIdx,
      nationalIdIdx,
      leaveTypeIdx,
      dayIdx,
      eventDateIdx,
      sourceIdx,
      descIdx,
      fullNoteIdx,
    ];

    if (required.some((i) => i === -1)) {
      return Response.json(
        { error: "بعض الأعمدة المطلوبة غير موجودة في شيت الإجازات" },
        { status: 500 }
      );
    }

    const events: LeaveEvent[] = [];

    for (const row of dataRows) {
      const rowNationalId = normalizeText(row[nationalIdIdx]);
      if (rowNationalId !== nationalId) continue;

      const leaveType = normalizeText(row[leaveTypeIdx]);
      if (leaveTypeFilter && leaveType !== leaveTypeFilter) continue;

      const isoDate = toIsoDateString(row[eventDateIdx]);
      if (!inDateWindow(isoDate, dateWindow.from, dateWindow.to)) continue;

      events.push({
        monthLabel: normalizeText(row[monthIdx]),
        name: normalizeText(row[nameIdx]),
        job: normalizeText(row[jobIdx]),
        nationalId: rowNationalId,
        leaveType,
        dayName: normalizeText(row[dayIdx]),
        eventDate: isoDate || normalizeText(row[eventDateIdx]),
        source: normalizeText(row[sourceIdx]),
        description: normalizeText(row[descIdx]),
        fullNote: String(row[fullNoteIdx] ?? "").trim(),
      });
    }

    events.sort((a, b) => {
      if (a.eventDate === b.eventDate) return 0;
      return a.eventDate > b.eventDate ? -1 : 1;
    });

    const finalEvents =
      limit > 0 ? events.slice(0, limit) : events;

    const employee = buildEmployeeInfo(finalEvents.length ? finalEvents : events, nationalId);
    const summary = buildSummary(finalEvents);

    return Response.json(
      {
        ok: true,
        nationalId,
        employee,
        summary,
        events: finalEvents,
        filters: {
          leaveType: leaveTypeFilter || null,
          limit: limit || null,
          range: searchParams.get("range") || null,
          months: searchParams.get("months") || null,
          year: searchParams.get("year") || null,
          month: searchParams.get("month") || null,
          from: dateWindow.from,
          to: dateWindow.to,
          mode: dateWindow.mode,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("leave-events error:", err);
    const message =
      err instanceof Error ? err.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}