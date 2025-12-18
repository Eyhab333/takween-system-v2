// app/api/internal-requests/notify/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

type Role = "employee" | "hr" | "chairman" | "ceo" | "admin" | "superadmin"
type RequestActionType =
  | "submitted"
  | "forwarded"
  | "approved"
  | "rejected"
  | "comment"
  | "closed"
  | "generated_pdf"

function getAdminServices() {
  if (!getApps().length) {
    const rawProjectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      ""

    const projectId = rawProjectId.replace(/["',\s]/g, "")
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
      )
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  }
}

async function getRequester(req: NextRequest) {
  const { auth } = getAdminServices()

  // 1) session cookie
  const sessionCookie = req.cookies.get("session")?.value
  if (sessionCookie) {
    const decoded = await auth.verifySessionCookie(sessionCookie, true)
    return {
      uid: decoded.uid,
      role: (decoded.role as string | undefined) || "employee",
    }
  }

  // 2) Bearer token
  const authHeader = req.headers.get("authorization") || ""
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (m?.[1]) {
    const decoded = await auth.verifyIdToken(m[1], true)
    return {
      uid: decoded.uid,
      role: (decoded.role as string | undefined) || "employee",
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const requester = await getRequester(req)
    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { db } = getAdminServices()

    const {
      requestId,
      actionType,
      actorUid,
      actorRole,
      targetRole,
      targetUid,
    }: {
      requestId: string
      actionType: RequestActionType
      actorUid: string
      actorRole: Role | null
      targetRole?: Role | null
      targetUid?: string | null
    } = await req.json()

    if (!requestId || !actionType || !actorUid) {
      return Response.json(
        { error: "Missing requestId/actionType/actorUid" },
        { status: 400 }
      )
    }

    // 🟦 هات الطلب
    const reqRef = db.collection("internalRequests").doc(requestId)
    const snap = await reqRef.get()
    if (!snap.exists) {
      return Response.json({ error: "Request not found" }, { status: 404 })
    }

    const data = snap.data() as any
    const createdByUid: string | undefined = data.createdByUid
    const title: string = data.title || "طلب داخلي"
    const currentStatus: string = data.status || "open"
    const currentAssignee: { uid?: string | null; role?: Role | null } =
      data.currentAssignee || {}

    // 🟦 حدد المستلمين حسب نوع الإجراء
    const recipients = new Set<string>()

    const addRecipient = (uid?: string | null) => {
      if (uid && uid !== actorUid) recipients.add(uid)
    }

    // 1) submitted → اشعار للمسؤول الحالي فقط
    if (actionType === "submitted") {
      addRecipient(currentAssignee.uid)
    }

    // 2) forwarded → اشعار للمستلم الجديد
    if (actionType === "forwarded") {
      if (targetUid) {
        addRecipient(targetUid)
      } else if (targetRole) {
        const q = await db
          .collection("users")
          .where("role", "==", targetRole)
          .get()
        q.forEach((d) => addRecipient(d.id))
      }
      // ممكن كمان تشعر صاحب الطلب لو حابب:
      addRecipient(createdByUid)
    }

    // 3) approved / rejected / closed → إشعار لصاحب الطلب
    if (
      actionType === "approved" ||
      actionType === "rejected" ||
      actionType === "closed"
    ) {
      addRecipient(createdByUid)
    }

    // 4) comment → إشعار لصاحب الطلب + المسؤول الحالي (لو مش نفس الشخص)
    if (actionType === "comment") {
      addRecipient(createdByUid)
      addRecipient(currentAssignee.uid)
    }

    if (recipients.size === 0) {
      return Response.json({ ok: true, sent: 0 })
    }

    // 🟦 نص الإشعار حسب نوع الإجراء
    let notifTitle = "تحديث على طلب داخلي"
    let notifBody = title

    switch (actionType) {
      case "submitted":
        notifTitle = "تم تقديم طلب جديد"
        break
      case "forwarded":
        notifTitle = "تمت إحالة طلب إليك"
        break
      case "approved":
        notifTitle = "تمت الموافقة على طلبك"
        break
      case "rejected":
        notifTitle = "تم رفض طلبك"
        break
      case "closed":
        notifTitle = "تم إغلاق طلبك"
        break
      case "comment":
        notifTitle = "تعليق جديد على طلب داخلي"
        break
      case "generated_pdf":
        notifTitle = "تم توليد ملف PDF للطلب"
        break
      default:
        break
    }

    const nowMs = Date.now()
    const nowTs = Timestamp.fromMillis(nowMs)

    const batch = db.batch()
    for (const uid of recipients) {
      const ref = db
        .collection("users")
        .doc(uid)
        .collection("notifications")
        .doc()

      batch.set(ref, {
        title: notifTitle,
        body: notifBody,
        type: "internal_request",
        link: `/internal-requests/${requestId}`,
        createdAt: nowTs,
        createdAtMs: nowMs,
        read: false,
        requestId,
        actionType,
        status: currentStatus,
      })
    }

    await batch.commit()
    return Response.json({ ok: true, sent: recipients.size })
  } catch (e: any) {
    console.error("internal-requests notify error:", e)
    return Response.json(
      { error: e?.message || "Notify failed" },
      { status: 500 }
    )
  }
}
