export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { google } from "googleapis";
import admin from "firebase-admin";

type SalaryRefRow = {
  name: string;
  job: string;
  nationalId: string;
  salary: number | null;
  dailySalary: number | null;
  perMinuteSalary: number | null;
  insuranceDeduction: number | null;
  email: string;
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

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID_SALARY_LEAVE || process.env.GOOGLE_SHEET_ID || "";

const SALARY_SHEET = {
  spreadsheetId: SPREADSHEET_ID,
  sheetName: "مرجع_الراتب",
  range: "A:O",
};

const DISCIPLINARY_SHEET = {
  spreadsheetId: SPREADSHEET_ID,
  sheetName: "أحداث_الجزاءات_للمنصة",
  range: "A:U",
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;

  const privateKey = (
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY ||
    ""
  ).replace(/\n/g, "\n");

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

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function normalizeId(value: unknown) {
  return normalizeDigits(String(value ?? ""))
    .replace(/[^\d]/g, "")
    .trim();
}

function escapeSheetName(name: string) {
  return name.replace(/'/g, "''");
}

function formatDateOnly(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoDateString(value: unknown): string | null {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]") {
    const d = value as Date;
    if (Number.isNaN(d.getTime())) return null;
    return formatDateOnly(d);
  }

  const s = normalizeDigits(String(value));
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
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
  to: string | null,
) {
  if (!isoDate) return false;
  if (from && isoDate < from) return false;
  if (to && isoDate > to) return false;
  return true;
}

function parseArabicNumber(value: unknown): number | null {
  const s = normalizeDigits(normalizeText(value))
    .replace(/[٬,]/g, "")
    .replace(/[^\d.-]/g, "");

  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function buildEmployeeInfo(
  nationalId: string,
  salaryRef: SalaryRefRow | null,
  events: DisciplinaryEvent[],
): EmployeeInfo {
  const first = events[0];

  return {
    nationalId,
    name: salaryRef?.name || first?.name || "—",
    job: salaryRef?.job || first?.job || "—",
    email: salaryRef?.email || first?.email || "",
    salary: salaryRef?.salary ?? null,
    dailySalary: salaryRef?.dailySalary ?? null,
    perMinuteSalary: salaryRef?.perMinuteSalary ?? null,
    insuranceDeduction: salaryRef?.insuranceDeduction ?? null,
  };
}

function buildSummary(events: DisciplinaryEvent[]): DisciplinarySummary {
  const countsByType: Record<string, number> = {};
  let latestDate: string | null = null;
  let totalValue = 0;

  for (const event of events) {
    const key = event.eventType || "غير محدد";
    countsByType[key] = (countsByType[key] || 0) + 1;

    if (event.eventDate && (!latestDate || event.eventDate > latestDate)) {
      latestDate = event.eventDate;
    }

    totalValue += event.deductionAmount || 0;
  }

  return {
    totalEvents: events.length,
    totalTypes: Object.keys(countsByType).length,
    latestDate,
    totalValue,
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
    if (!SPREADSHEET_ID) {
      return Response.json(
        { error: "بيئة Google Service Account أو Spreadsheet ID غير مكتملة" },
        { status: 500 },
      );
    }

    const requester = await getRequester(req);
    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const nationalId = normalizeId(searchParams.get("nationalId"));
    const eventTypeFilter = normalizeText(searchParams.get("eventType"));
    const processingStatusFilter = normalizeText(
      searchParams.get("processingStatus"),
    );
    const contractYearFilter = normalizeText(searchParams.get("contractYear"));
    const limit = Number(searchParams.get("limit") || "0");
    const dateWindow = resolveDateWindow(searchParams);

    if (!nationalId) {
      return Response.json({ error: "nationalId مطلوب" }, { status: 400 });
    }

    const isHrOrAbove = HR_ROLES.includes(requester.role as any);

    if (!isHrOrAbove) {
      const app = getAdminApp();
      const userSnap = await app
        .firestore()
        .doc(`users/${requester.uid}`)
        .get();

      if (!userSnap.exists) {
        return Response.json(
          { error: "Requester user doc not found" },
          { status: 403 },
        );
      }

      const userData = userSnap.data() as Record<string, unknown>;
      const personalInfo =
        (userData.personalInfo as Record<string, unknown> | undefined) || {};

      const myNationalId = normalizeId(
        personalInfo.nationalId || userData.nationalId || "",
      );

      if (myNationalId !== nationalId) {
        return Response.json(
          { error: "Forbidden: nationalId لا يطابق حسابك" },
          { status: 403 },
        );
      }
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey) {
      return Response.json(
        { error: "بيئة Google Service Account أو Spreadsheet ID غير مكتملة" },
        { status: 500 },
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

    const salaryRange = `'${escapeSheetName(SALARY_SHEET.sheetName)}'!${SALARY_SHEET.range}`;
    const disciplinaryRange = `'${escapeSheetName(DISCIPLINARY_SHEET.sheetName)}'!${DISCIPLINARY_SHEET.range}`;

    const [salaryRes, disciplinaryRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SALARY_SHEET.spreadsheetId,
        range: salaryRange,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: DISCIPLINARY_SHEET.spreadsheetId,
        range: disciplinaryRange,
      }),
    ]);

    const salaryRows = salaryRes.data.values || [];
    const disciplinaryRows = disciplinaryRes.data.values || [];

    if (salaryRows.length < 2) {
      return Response.json(
        { error: "لا توجد بيانات كافية في شيت مرجع_الراتب" },
        { status: 404 },
      );
    }

    if (disciplinaryRows.length < 2) {
      return Response.json(
        { error: "لا توجد بيانات كافية في شيت أحداث_الجزاءات_للمنصة" },
        { status: 404 },
      );
    }

    const salaryHeaders = salaryRows[0].map((h) => normalizeText(h));
    const salaryDataRows = salaryRows.slice(1);

    const disciplinaryHeaders = disciplinaryRows[0].map((h) =>
      normalizeText(h),
    );
    const disciplinaryDataRows = disciplinaryRows.slice(1);

    const salaryIndexOf = (name: string) =>
      salaryHeaders.indexOf(normalizeText(name));

    const disciplinaryIndexOf = (name: string) =>
      disciplinaryHeaders.indexOf(normalizeText(name));

    const salaryNameIdx = salaryIndexOf("الاسم");
    const salaryJobIdx = salaryIndexOf("الوظيفة");
    const salaryNationalIdIdx = salaryIndexOf("السجل المدني");
    const salaryIdx = salaryIndexOf("الراتب");
    const dailySalaryIdx = salaryIndexOf("الراتب اليومي");
    const perMinuteSalaryIdx = salaryIndexOf("الراتب بالدقيقة");
    const insuranceDeductionIdx = salaryIndexOf("خصم التأمينات");
    const salaryEmailIdx = salaryIndexOf("البريد الإلكتروني");

    const disciplinaryNationalIdIdx = disciplinaryIndexOf("السجل المدني");
    const disciplinaryNameIdx = disciplinaryIndexOf("الاسم");
    const disciplinaryJobIdx = disciplinaryIndexOf("الوظيفة");
    const eventTypeIdx = disciplinaryIndexOf("نوع الحدث");
    const eventDescriptionIdx = disciplinaryIndexOf("وصف الحدث");
    const valueIdx = disciplinaryIndexOf("القيمة");
    const eventDateIdx = disciplinaryIndexOf("التاريخ");
    const contractYearIdx = disciplinaryIndexOf("السنة العقدية");
    const deductionAmountIdx = disciplinaryIndexOf("الحسم");
    const penaltyIdx = disciplinaryIndexOf("الجزاء");
    const adminActionIdx = disciplinaryIndexOf("الإجراء الإداري");
    const ruleCodeIdx = disciplinaryIndexOf("كود القاعدة");
    const repetitionInContractYearIdx = disciplinaryIndexOf(
      "رقم التكرار في السنة العقدية",
    );
    const byLawTextIdx = disciplinaryIndexOf("حسب اللائحة");
    const eventKeyIdx = disciplinaryIndexOf("مفتاح الحدث");
    const repetitionKeyIdx = disciplinaryIndexOf("مفتاح التكرار");
    const processingStatusIdx = disciplinaryIndexOf("حالة المعالجة");
    const disciplinaryEmailIdx = disciplinaryIndexOf("البريد الإلكتروني");
    const notificationSentIdx = disciplinaryIndexOf("تم إرسال الإشعار؟");
    const sentAtIdx = disciplinaryIndexOf("تاريخ الإرسال");
    const sendNoteIdx = disciplinaryIndexOf("ملاحظة الإرسال");

    const salaryRequired = [
      salaryNameIdx,
      salaryJobIdx,
      salaryNationalIdIdx,
      salaryIdx,
      dailySalaryIdx,
      perMinuteSalaryIdx,
      insuranceDeductionIdx,
    ];

    const disciplinaryRequired = [
      disciplinaryNationalIdIdx,
      disciplinaryNameIdx,
      disciplinaryJobIdx,
      eventTypeIdx,
      eventDescriptionIdx,
      valueIdx,
      eventDateIdx,
      contractYearIdx,
      deductionAmountIdx,
      penaltyIdx,
      adminActionIdx,
      ruleCodeIdx,
      repetitionInContractYearIdx,
      byLawTextIdx,
      eventKeyIdx,
      repetitionKeyIdx,
      processingStatusIdx,
      disciplinaryEmailIdx,
      notificationSentIdx,
      sentAtIdx,
      sendNoteIdx,
    ];

    if (salaryRequired.some((i) => i === -1)) {
      return Response.json(
        { error: "بعض الأعمدة المطلوبة غير موجودة في شيت مرجع_الراتب" },
        { status: 500 },
      );
    }

    if (disciplinaryRequired.some((i) => i === -1)) {
      return Response.json(
        {
          error: "بعض الأعمدة المطلوبة غير موجودة في شيت أحداث_الجزاءات_للمنصة",
        },
        { status: 500 },
      );
    }

    let salaryRef: SalaryRefRow | null = null;

    for (const row of salaryDataRows) {
      const rowNationalId = normalizeId(row[salaryNationalIdIdx]);
      if (rowNationalId !== nationalId) continue;

      salaryRef = {
        nationalId: rowNationalId,
        name: normalizeText(row[salaryNameIdx]),
        job: normalizeText(row[salaryJobIdx]),
        salary: parseArabicNumber(row[salaryIdx]),
        dailySalary: parseArabicNumber(row[dailySalaryIdx]),
        perMinuteSalary: parseArabicNumber(row[perMinuteSalaryIdx]),
        insuranceDeduction: parseArabicNumber(row[insuranceDeductionIdx]),
        email: salaryEmailIdx === -1 ? "" : normalizeText(row[salaryEmailIdx]),
      };
      break;
    }

    const events: DisciplinaryEvent[] = [];

    for (const row of disciplinaryDataRows) {
      const rowNationalId = normalizeId(row[disciplinaryNationalIdIdx]);
      if (rowNationalId !== nationalId) continue;

      const eventType = normalizeText(row[eventTypeIdx]);
      if (eventTypeFilter && eventType !== eventTypeFilter) continue;

      const processingStatus = normalizeText(row[processingStatusIdx]);
      if (
        processingStatusFilter &&
        processingStatus !== processingStatusFilter
      ) {
        continue;
      }

      const contractYear = normalizeText(row[contractYearIdx]);
      if (contractYearFilter && contractYear !== contractYearFilter) {
        continue;
      }

      const isoDate = toIsoDateString(row[eventDateIdx]);
      if (!inDateWindow(isoDate, dateWindow.from, dateWindow.to)) continue;

      events.push({
        nationalId: rowNationalId,
        name: normalizeText(row[disciplinaryNameIdx]),
        job: normalizeText(row[disciplinaryJobIdx]),
        eventType,
        eventDescription: normalizeText(row[eventDescriptionIdx]),
        value: parseArabicNumber(row[valueIdx]),
        eventDate: isoDate || normalizeText(row[eventDateIdx]),
        contractYear,
        deductionAmount: parseArabicNumber(row[deductionAmountIdx]),
        penalty: normalizeText(row[penaltyIdx]),
        penaltyAmount: parseArabicNumber(row[deductionAmountIdx]),
        adminAction: normalizeText(row[adminActionIdx]),
        ruleCode: normalizeText(row[ruleCodeIdx]),
        repetitionInContractYear: normalizeText(
          row[repetitionInContractYearIdx],
        ),
        byLawText:
          normalizeText(row[byLawTextIdx]) ||
          normalizeText(row[adminActionIdx]) ||
          normalizeText(row[penaltyIdx]) ||
          "—",
        eventKey: normalizeText(row[eventKeyIdx]),
        repetitionKey: normalizeText(row[repetitionKeyIdx]),
        processingStatus,
        email: normalizeText(row[disciplinaryEmailIdx]),
        notificationSent: normalizeText(row[notificationSentIdx]),
        sentAt:
          toIsoDateString(row[sentAtIdx]) || normalizeText(row[sentAtIdx]),
        sendNote: normalizeText(row[sendNoteIdx]),
      });
    }

    events.sort((a, b) => {
      if (a.eventDate === b.eventDate) return 0;
      return a.eventDate > b.eventDate ? -1 : 1;
    });

    const finalEvents = limit > 0 ? events.slice(0, limit) : events;
    const employee = buildEmployeeInfo(
      nationalId,
      salaryRef,
      finalEvents.length ? finalEvents : events,
    );
    const summary = buildSummary(finalEvents);

    return Response.json(
      {
        ok: true,
        nationalId,
        employee,
        summary,
        events: finalEvents,
        filters: {
          eventType: eventTypeFilter || null,
          processingStatus: processingStatusFilter || null,
          contractYear: contractYearFilter || null,
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
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("disciplinary-events error:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
