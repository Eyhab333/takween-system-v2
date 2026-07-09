export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { google } from "googleapis";
import admin from "firebase-admin";

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

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID_SALARY_LEAVE || process.env.GOOGLE_SHEET_ID || "";

const SALARY_SUMMARY_SHEET = {
  spreadsheetId: SPREADSHEET_ID,
  sheetName: "ملخص_الراتب_للمنصة",
  range: "A:R",
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
  ).replace(/\\n/g, "\n");

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
  return normalizeDigits(String(value ?? "")).replace(/[^\d]/g, "").trim();
}

function escapeSheetName(name: string) {
  return name.replace(/'/g, "''");
}

function parseArabicNumber(value: unknown): number | null {
  const s = normalizeDigits(normalizeText(value))
    .replace(/[٬,]/g, "")
    .replace(/[^\d.-]/g, "");

  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeMonthKey(value: unknown) {
  const raw = normalizeDigits(normalizeText(value)).toLowerCase();

  if (!raw) return "";

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    return String(numeric);
  }

  const monthMap: Record<string, string> = {
    يناير: "1",
    jan: "1",
    january: "1",

    فبراير: "2",
    feb: "2",
    february: "2",

    مارس: "3",
    mar: "3",
    march: "3",

    أبريل: "4",
    ابريل: "4",
    apr: "4",
    april: "4",

    مايو: "5",
    may: "5",

    يونيو: "6",
    jun: "6",
    june: "6",

    يوليو: "7",
    jul: "7",
    july: "7",

    أغسطس: "8",
    اغسطس: "8",
    aug: "8",
    august: "8",

    سبتمبر: "9",
    sep: "9",
    september: "9",

    أكتوبر: "10",
    اكتوبر: "10",
    oct: "10",
    october: "10",

    نوفمبر: "11",
    nov: "11",
    november: "11",

    ديسمبر: "12",
    dec: "12",
    december: "12",
  };

  return monthMap[raw] || raw;
}

function monthSortValue(value: string) {
  const n = Number(normalizeMonthKey(value));
  return Number.isFinite(n) ? n : 0;
}

function rowYearSortValue(value: string) {
  const n = Number(normalizeDigits(value));
  return Number.isFinite(n) ? n : 0;
}

function buildHeaderIndex(headers: unknown[]) {
  const map = new Map<string, number>();

  headers.forEach((header, index) => {
    const key = normalizeText(header);
    if (key) map.set(key, index);
  });

  return map;
}

function indexOfRequired(map: Map<string, number>, name: string) {
  const index = map.get(normalizeText(name));
  return typeof index === "number" ? index : -1;
}

function cell(row: unknown[], index: number) {
  return index === -1 ? "" : row[index];
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

function parseSalarySummaryRows(
  rows: unknown[][],
  nationalId: string,
): SalarySummaryRow[] {
  if (rows.length < 2) return [];

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const headerMap = buildHeaderIndex(headers);

  const yearIdx = indexOfRequired(headerMap, "السنة");
  const monthIdx = indexOfRequired(headerMap, "الشهر");
  const nationalIdIdx = indexOfRequired(headerMap, "السجل المدني");
  const nameIdx = indexOfRequired(headerMap, "الاسم");
  const jobIdx = indexOfRequired(headerMap, "الوظيفة");
  const netSalaryIdx = indexOfRequired(headerMap, "صافي الراتب");
  const basicSalaryIdx = indexOfRequired(headerMap, "الراتب الأساسي");
  const workingDaysIdx = indexOfRequired(headerMap, "أيام العمل في الشهر");
  const actualAttendanceDaysIdx = indexOfRequired(
    headerMap,
    "أيام الحضور الفعلي",
  );
  const attendanceBasedSalaryIdx = indexOfRequired(
    headerMap,
    "مبلغ مستحق حسب الحضور",
  );
  const absenceDeductionAmountIdx = indexOfRequired(
    headerMap,
    "مبلغ خصم الغياب",
  );
  const lateDeductionAmountIdx = indexOfRequired(
    headerMap,
    "مبلغ خصم التأخر",
  );
  const insuranceDeductionIdx = indexOfRequired(headerMap, "خصم التأمينات");
  const qorraAllowanceIdx = indexOfRequired(headerMap, "بدل برنامج قرة");
  const busAllowanceIdx = indexOfRequired(headerMap, "بدل الباص");
  const totalAllowancesIdx = indexOfRequired(headerMap, "إجمالي البدلات");
  const totalDeductionsIdx = indexOfRequired(headerMap, "إجمالي الخصومات");
  const notesIdx = indexOfRequired(headerMap, "ملاحظات");

  const required = [
    yearIdx,
    monthIdx,
    nationalIdIdx,
    nameIdx,
    jobIdx,
    netSalaryIdx,
    basicSalaryIdx,
    workingDaysIdx,
    actualAttendanceDaysIdx,
    attendanceBasedSalaryIdx,
    absenceDeductionAmountIdx,
    lateDeductionAmountIdx,
    insuranceDeductionIdx,
    qorraAllowanceIdx,
    busAllowanceIdx,
    totalAllowancesIdx,
    totalDeductionsIdx,
    notesIdx,
  ];

  if (required.some((i) => i === -1)) {
    throw new Error("بعض الأعمدة المطلوبة غير موجودة في شيت ملخص_الراتب_للمنصة");
  }

  return dataRows
    .filter((row) => normalizeId(cell(row, nationalIdIdx)) === nationalId)
    .map((row) => {
      const month = normalizeText(cell(row, monthIdx));

      return {
        year: normalizeText(cell(row, yearIdx)),
        month,
        monthKey: normalizeMonthKey(month),
        nationalId: normalizeId(cell(row, nationalIdIdx)),
        name: normalizeText(cell(row, nameIdx)),
        job: normalizeText(cell(row, jobIdx)),
        netSalary: parseArabicNumber(cell(row, netSalaryIdx)),
        basicSalary: parseArabicNumber(cell(row, basicSalaryIdx)),
        workingDays: parseArabicNumber(cell(row, workingDaysIdx)),
        actualAttendanceDays: parseArabicNumber(
          cell(row, actualAttendanceDaysIdx),
        ),
        attendanceBasedSalary: parseArabicNumber(
          cell(row, attendanceBasedSalaryIdx),
        ),
        absenceDeductionAmount: parseArabicNumber(
          cell(row, absenceDeductionAmountIdx),
        ),
        lateDeductionAmount: parseArabicNumber(
          cell(row, lateDeductionAmountIdx),
        ),
        insuranceDeduction: parseArabicNumber(cell(row, insuranceDeductionIdx)),
        qorraAllowance: parseArabicNumber(cell(row, qorraAllowanceIdx)),
        busAllowance: parseArabicNumber(cell(row, busAllowanceIdx)),
        totalAllowances: parseArabicNumber(cell(row, totalAllowancesIdx)),
        totalDeductions: parseArabicNumber(cell(row, totalDeductionsIdx)),
        notes: normalizeText(cell(row, notesIdx)),
      };
    })
    .sort((a, b) => {
      const ya = rowYearSortValue(a.year);
      const yb = rowYearSortValue(b.year);
      if (ya !== yb) return yb - ya;

      const ma = monthSortValue(a.monthKey);
      const mb = monthSortValue(b.monthKey);
      return mb - ma;
    });
}

export async function GET(req: NextRequest) {
  try {
    if (!SPREADSHEET_ID) {
      return Response.json(
        { error: "Spreadsheet ID غير موجود في متغيرات البيئة" },
        { status: 500 },
      );
    }

    const requester = await getRequester(req);
    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const nationalId = normalizeId(searchParams.get("nationalId"));
    const yearFilter = normalizeText(searchParams.get("year"));
    const monthFilter = normalizeMonthKey(searchParams.get("month"));

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
        { error: "بيئة Google Service Account غير مكتملة" },
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

    const range = `'${escapeSheetName(SALARY_SUMMARY_SHEET.sheetName)}'!${SALARY_SUMMARY_SHEET.range}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SALARY_SUMMARY_SHEET.spreadsheetId,
      range,
    });

    const sheetRows = (res.data.values || []) as unknown[][];

    if (sheetRows.length < 2) {
      return Response.json(
        { error: "لا توجد بيانات كافية في شيت ملخص_الراتب_للمنصة" },
        { status: 404 },
      );
    }

    const allRows = parseSalarySummaryRows(sheetRows, nationalId);

    const filteredRows = allRows.filter((row) => {
      if (yearFilter && yearFilter !== "all" && row.year !== yearFilter) {
        return false;
      }

      if (
        monthFilter &&
        monthFilter !== "all" &&
        row.monthKey !== monthFilter
      ) {
        return false;
      }

      return true;
    });

    const selected = filteredRows[0] || allRows[0] || null;

    const availablePeriods = allRows.map((row) => ({
      year: row.year,
      month: row.month,
      monthKey: row.monthKey,
    }));

    const payload: SalarySummaryResponse = {
      ok: true,
      nationalId,
      selected,
      rows: filteredRows,
      availablePeriods,
    };

    return Response.json(payload, { status: 200 });
  } catch (err: unknown) {
    console.error("salary-summary error:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}