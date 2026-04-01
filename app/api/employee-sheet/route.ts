export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { google } from "googleapis";
import admin from "firebase-admin";
import { EMPLOYEE_SHEET_SECTIONS } from "@/lib/employee-sheet-sections";

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

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

function normalizeHeader(value: unknown) {
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const nationalId = searchParams.get("nationalId")?.trim();
    const section = searchParams.get("section")?.trim() || "info";

    if (!nationalId) {
      return Response.json(
        { error: "nationalId مفقود في الـ query" },
        { status: 400 }
      );
    }

    const cfg =
      EMPLOYEE_SHEET_SECTIONS[
        section as keyof typeof EMPLOYEE_SHEET_SECTIONS
      ];

    if (!cfg) {
      return Response.json(
        { error: "section غير معروف" },
        { status: 400 }
      );
    }

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

    if (!isHrOrAbove) {
      const userSnap = await app.firestore().doc(`users/${requesterUid}`).get();

      if (!userSnap.exists) {
        return Response.json(
          { error: "Requester user doc not found" },
          { status: 403 }
        );
      }

      const userData = userSnap.data() as any;
      const myNationalId = String(
        userData?.personalInfo?.nationalId ||
          userData?.nationalId ||
          ""
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
        { error: "بيئة Google Service Account غير مكتملة" },
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

    const range = `'${escapeSheetName(cfg.sheetName)}'!${cfg.range}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: cfg.spreadsheetId,
      range,
    });

    const rows = res.data.values || [];

    if (rows.length === 0) {
      return Response.json(
        { error: "لا توجد بيانات في الشيت" },
        { status: 404 }
      );
    }

    const rawHeaders = rows[0];
    const headers = rawHeaders.map((h) => normalizeHeader(h));

    const nationalIdHeader = normalizeHeader(cfg.nationalIdHeader);
    const nationalIdIndex = headers.indexOf(nationalIdHeader);

    if (nationalIdIndex === -1) {
      return Response.json(
        { error: `لم يتم العثور على عمود ${cfg.nationalIdHeader}` },
        { status: 500 }
      );
    }

    const dataRow = rows.find(
      (row, idx) =>
        idx > 0 &&
        normalizeHeader(row[nationalIdIndex]) === normalizeHeader(nationalId)
    );

    if (!dataRow) {
      return Response.json(
        { error: "لم يتم العثور على موظف بهذا الرقم" },
        { status: 404 }
      );
    }

    const allowedFieldsSet = new Set(
      (cfg.allowedFields || []).map((f) => normalizeHeader(f))
    );

    const employee: Record<string, string> = {};

    headers.forEach((header, i) => {
      if (!header) return;
      if (allowedFieldsSet.size > 0 && !allowedFieldsSet.has(header)) return;

      employee[header] = String(dataRow[i] ?? "").trim();
    });

    return Response.json(
      {
        ok: true,
        section,
        nationalId,
        employee,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("employee-sheet error:", err);

    return Response.json(
      { error: err?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}