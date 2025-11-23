export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

function getAdminServices() {
  if (!getApps().length) {
    const rawProjectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      "";

    const projectId = rawProjectId.replace(/["',\s]/g, "");
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
      );
    }

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

async function getRequester(req: NextRequest) {
  const { auth } = getAdminServices();

  // session cookie (اختياري)
  const sessionCookie = req.cookies.get("session")?.value;
  if (sessionCookie) {
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    return {
      uid: decoded.uid,
      role: (decoded.role as string | undefined) || "employee",
    };
  }

  // Bearer token
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) {
    const decoded = await auth.verifyIdToken(m[1], true);
    return {
      uid: decoded.uid,
      role: (decoded.role as string | undefined) || "employee",
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const requester = await getRequester(req);
    if (!requester)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!HR_ROLES.includes(requester.role as any))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const {
      targetUid,
      title,
      fileUrl = "",
      date = null,
      employeeName = null,
      employeeDepartment = null,
      employeePosition = null,
      employeeEmail = null,
    } = body || {};

    if (!targetUid || !title) {
      return Response.json(
        { error: "targetUid/title مطلوبين" },
        { status: 400 }
      );
    }

    const { db } = getAdminServices();

    const nowMs = Date.now();
    const nowTs = Timestamp.fromMillis(nowMs);

    // 1) اكتب الشهادة
    const certRef = db
      .collection("users")
      .doc(targetUid)
      .collection("certificates")
      .doc();

    await certRef.set({
      title,
      fileUrl,
      date,
      createdAt: nowTs,
      createdAtMs: nowMs,
      employeeId: targetUid,
      employeeName,
      employeeDepartment,
      employeePosition,
      employeeEmail,
      createdBy: requester.uid,
    });

    // 2) اكتب إشعار للمستخدم
    const notifRef = db
      .collection("users")
      .doc(targetUid)
      .collection("notifications")
      .doc();

    await notifRef.set({
      title: "تمت إضافة شهادة جديدة",
      body: title,
      type: "certificate",
      link: `/employees/${targetUid}#certificates`,
      createdAt: nowTs,
      createdAtMs: nowMs,
      read: false,
      certId: certRef.id,
    });

    return Response.json({
      ok: true,
      certId: certRef.id,
      notifId: notifRef.id,
    });
  } catch (e: any) {
    console.error("add-certificate error:", e);
    return Response.json(
      { error: e?.message || "Add certificate failed" },
      { status: 500 }
    );
  }
}
