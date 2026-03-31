export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { google } from "googleapis";
import admin from "firebase-admin";
import { getEmployeeSectionConfig } from "@/lib/employee-file-sections";

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

function escapeSheetName(name: string) {
  return name.replace(/'/g, "''");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const nationalId = searchParams.get("nationalId")?.trim();
    const section = searchParams.get("section")?.trim();

    if (!nationalId) {
      return Response.json(
        { error: "nationalId مفقود في الـ query" },
        { status: 400 }
      );
    }

    if (!section) {
      return Response.json(
        { error: "section مفقود في الـ query" },
        { status: 400 }
      );
    }

    const sectionConfig = getEmployeeSectionConfig(section);
    if (!sectionConfig) {
      return Response.json(
        { error: "section غير معروف أو غير مسموح" },
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

      const myNationalId =
        String(
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
    const spreadsheetId =
      process.env.GOOGLE_SHEET_ID || "1FAKE_SPREADSHEET_ID_CHANGE_ME";

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

    const sheetName = escapeSheetName(sectionConfig.sheetName);
    const range = `'${sheetName}'!${sectionConfig.range || "A1:AZ1000"}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) {
      return Response.json({ error: "لا توجد بيانات في الشيت" }, { status: 404 });
    }

    const headers = rows[0].map((h: string) => (h || "").trim());
    const nationalIdHeader = sectionConfig.nationalIdHeader || "nationalId";
    const nationalIdIndex = headers.indexOf(nationalIdHeader);

    if (nationalIdIndex === -1) {
      return Response.json(
        { error: `لم يتم العثور على عمود ${nationalIdHeader} في الشيت` },
        { status: 500 }
      );
    }

    const dataRow = rows.find(
      (row, idx) => idx > 0 && String(row[nationalIdIndex] ?? "").trim() === nationalId
    );

    if (!dataRow) {
      return Response.json(
        { error: "لم يتم العثور على موظف بهذا الرقم" },
        { status: 404 }
      );
    }

    const employee: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (!header) return;
      employee[header] = String(dataRow[i] ?? "").trim();
    });

    let finalEmployee = employee;

    if (sectionConfig.visibleFields?.length) {
      finalEmployee = {};
      for (const key of sectionConfig.visibleFields) {
        if (key in employee) {
          finalEmployee[key] = employee[key];
        }
      }
    }

    return Response.json(
      {
        ok: true,
        nationalId,
        section,
        title: sectionConfig.title,
        employee: finalEmployee,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("employee-sheet error:", err);

    return Response.json(
      { error: err?.message || String(err) || "Unknown server error" },
      { status: 500 }
    );
  }
}