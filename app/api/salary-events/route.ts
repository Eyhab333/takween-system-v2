export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { google } from "googleapis";
import admin from "firebase-admin";

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID_SALARY_LEAVE ||
  process.env.EMPLOYEE_SHEET_ID ||
  "";

const EMPLOYEES_SHEET = "موظفو_الراتب";
const EVENTS_SHEET = "حركات_الراتب";

type EventType = "delay" | "absence" | "fingerprint";

type EmployeeRow = {
  nationalId: string;
  name: string;
  job: string;
  salary: number | string;
  insuranceDeduction: number | string;
};

type EventRow = {
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

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeId(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function escapeSheetName(name: string) {
  return name.replace(/'/g, "''");
}

function toNumber(value: unknown): number | string {
  const s = normalizeText(value)
    .replace(/٬/g, "")
    .replace(/,/g, "")
    .replace(/٫/g, ".");

  if (!s) return "";
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
}

function toIsoDateString(value: unknown): string {
  if (value == null || value === "") return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    const d = value as Date;
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  const s = normalizeText(value);
  if (!s) return "";

  let m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }

  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  return s;
}

function subtractMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
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

function formatDateOnly(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function resolveDateWindow(searchParams: URLSearchParams): {
  from: string | null;
  to: string | null;
  mode: string;
} {
  const range = normalizeText(searchParams.get("range")).toLowerCase();
  const fromParam = toIsoDateString(searchParams.get("from"));
  const toParam = toIsoDateString(searchParams.get("to"));
  const yearParam = Number(searchParams.get("year") || "");
  const monthParam = Number(searchParams.get("month") || "");
  const monthsParam = Number(searchParams.get("months") || "");

  if (range === "all") {
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
  const from = formatDateOnly(subtractMonths(now, months));
  const to = formatDateOnly(now);

  return { from, to, mode: "months" };
}

function dateInRange(dateStr: string, from: string | null, to: string | null): boolean {
  if (!dateStr) return true;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

async function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!SPREADSHEET_ID || !clientEmail || !privateKey) {
    throw new Error("بيئة Google Service Account أو Spreadsheet ID غير مكتملة");
  }

  const gAuth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth: gAuth });
}

async function readSheetValues(sheetName: string) {
  const sheets = await getSheetsClient();

  const range = `'${escapeSheetName(sheetName)}'!A:Z`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  return res.data.values || [];
}

function parseEmployees(rows: string[][]): EmployeeRow[] {
  if (rows.length <= 1) return [];

  return rows
    .slice(1)
    .map((row) => ({
      nationalId: normalizeId(row[0]),
      name: normalizeText(row[1]),
      job: normalizeText(row[2]),
      salary: toNumber(row[3]),
      insuranceDeduction: toNumber(row[4]),
    }))
    .filter((row) => row.nationalId);
}

function parseEvents(rows: string[][]): EventRow[] {
  if (rows.length <= 1) return [];

  return rows
    .slice(1)
    .map((row) => ({
      nationalId: normalizeId(row[0]),
      name: normalizeText(row[1]),
      job: normalizeText(row[2]),
      eventType: normalizeText(row[3]).toLowerCase() as EventType | string,
      eventLabel: normalizeText(row[4]),
      eventValue: toNumber(row[5]),
      eventDate: toIsoDateString(row[6]),
      deduction: toNumber(row[7]),
      penalty: normalizeText(row[8]),
      eventKey: normalizeText(row[9]),
    }))
    .filter((row) => row.nationalId && row.eventType);
}

function buildSummary(events: EventRow[]) {
  let totalDelayMinutes = 0;
  let totalDeduction = 0;
  let delayCount = 0;
  let absenceCount = 0;
  let fingerprintCount = 0;

  for (const event of events) {
    if (event.eventType === "delay") {
      delayCount += 1;
      totalDelayMinutes += typeof event.eventValue === "number" ? event.eventValue : 0;
    }

    if (event.eventType === "absence") {
      absenceCount += 1;
    }

    if (event.eventType === "fingerprint") {
      fingerprintCount += 1;
    }

    if (typeof event.deduction === "number") {
      totalDeduction += event.deduction;
    }
  }

  return {
    totalEvents: events.length,
    delayCount,
    absenceCount,
    fingerprintCount,
    totalDelayMinutes,
    totalDeduction: Number(totalDeduction.toFixed(2)),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const requestedNationalId = normalizeId(searchParams.get("nationalId"));
    const type = normalizeText(searchParams.get("type")).toLowerCase();
    const limitParam = Number(searchParams.get("limit") || "");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;
    const dateWindow = resolveDateWindow(searchParams);

    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1];

    if (!idToken) {
      return Response.json(
        { error: "Unauthorized: missing Bearer token" },
        { status: 401 }
      );
    }

    const app = getAdminApp();
    const decoded = await app.auth().verifyIdToken(idToken);

    const requesterUid = decoded.uid;
    const requesterRole = (decoded.role as string | undefined) || "employee";
    const isHrOrAbove = HR_ROLES.includes(requesterRole as any);

    let effectiveNationalId = requestedNationalId;

    if (!isHrOrAbove) {
      const userSnap = await app.firestore().doc(`users/${requesterUid}`).get();

      if (!userSnap.exists) {
        return Response.json(
          { error: "Requester user doc not found" },
          { status: 403 }
        );
      }

      const userData = userSnap.data() as Record<string, unknown>;
      const personalInfo = (userData.personalInfo as Record<string, unknown> | undefined) || {};

      const myNationalId = normalizeId(
        personalInfo.nationalId || userData.nationalId || ""
      );

      if (!myNationalId) {
        return Response.json(
          { error: "لم يتم العثور على nationalId في حساب المستخدم" },
          { status: 403 }
        );
      }

      if (requestedNationalId && requestedNationalId !== myNationalId) {
        return Response.json(
          { error: "Forbidden: nationalId لا يطابق حسابك" },
          { status: 403 }
        );
      }

      effectiveNationalId = myNationalId;
    }

    const [employeesRaw, eventsRaw] = await Promise.all([
      readSheetValues(EMPLOYEES_SHEET),
      readSheetValues(EVENTS_SHEET),
    ]);

    const employees = parseEmployees(employeesRaw);
    let events = parseEvents(eventsRaw);

    if (effectiveNationalId) {
      events = events.filter((e) => e.nationalId === effectiveNationalId);
    }

    if (type) {
      events = events.filter((e) => normalizeText(e.eventType).toLowerCase() === type);
    }

    if (dateWindow.mode !== "all") {
      events = events.filter((e) =>
        dateInRange(e.eventDate, dateWindow.from, dateWindow.to)
      );
    }

    events = events.sort((a, b) => {
      if (a.eventDate !== b.eventDate) return a.eventDate > b.eventDate ? -1 : 1;
      return a.eventType < b.eventType ? -1 : a.eventType > b.eventType ? 1 : 0;
    });

    if (limit) {
      events = events.slice(0, limit);
    }

    if (effectiveNationalId) {
      const employee =
        employees.find((e) => e.nationalId === effectiveNationalId) || {
          nationalId: effectiveNationalId,
          name: events[0]?.name || "",
          job: events[0]?.job || "",
          salary: "",
          insuranceDeduction: "",
        };

      return Response.json(
        {
          ok: true,
          nationalId: effectiveNationalId,
          filters: {
            type: type || null,
            limit: limit || null,
            range: searchParams.get("range") || null,
            months: searchParams.get("months") || null,
            year: searchParams.get("year") || null,
            month: searchParams.get("month") || null,
            from: dateWindow.from,
            to: dateWindow.to,
            mode: dateWindow.mode,
          },
          employee,
          summary: buildSummary(events),
          events,
        },
        { status: 200 }
      );
    }

    const employeeMap = new Map(
      employees.map((e) => [e.nationalId, e] as const)
    );

    const grouped = new Map<
      string,
      {
        employee: EmployeeRow;
        events: EventRow[];
      }
    >();

    for (const event of events) {
      if (!grouped.has(event.nationalId)) {
        grouped.set(event.nationalId, {
          employee:
            employeeMap.get(event.nationalId) || {
              nationalId: event.nationalId,
              name: event.name,
              job: event.job,
              salary: "",
              insuranceDeduction: "",
            },
          events: [],
        });
      }

      grouped.get(event.nationalId)!.events.push(event);
    }

    const data = Array.from(grouped.values())
      .map((item) => ({
        employee: item.employee,
        summary: buildSummary(item.events),
        events: item.events,
      }))
      .sort((a, b) => {
        const nameA = normalizeText(a.employee.name);
        const nameB = normalizeText(b.employee.name);
        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
      });

    return Response.json(
      {
        ok: true,
        filters: {
          type: type || null,
          limit: limit || null,
          range: searchParams.get("range") || null,
          months: searchParams.get("months") || null,
          year: searchParams.get("year") || null,
          month: searchParams.get("month") || null,
          from: dateWindow.from,
          to: dateWindow.to,
          mode: dateWindow.mode,
        },
        totals: {
          employees: data.length,
          events: events.length,
        },
        data,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("salary-events error:", err);

    const message =
      err instanceof Error ? err.message : "Unknown server error";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}