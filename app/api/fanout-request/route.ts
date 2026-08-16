// app/api/fanout-request/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/server/firebaseAdmin";
import { getMessaging } from "firebase-admin/messaging";
import { FieldValue } from "firebase-admin/firestore";

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

async function getRequester(req: NextRequest) {
  const { auth } = getAdminServices();

  // Bearer token فقط (خلّيناها واضحة)
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) return null;

  const decoded = await auth.verifyIdToken(m[1], true);
  return {
    uid: decoded.uid,
    role: (decoded.role as string | undefined) || "employee",
  };
}

async function getMyRecipientKey(uid: string) {
  const { db } = getAdminServices();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return (snap.data() as any)?.requestRecipientKey ?? null;
}

async function resolveUidsByRecipientKeys(keys: string[]) {
  const { db } = getAdminServices();
  const uniq = Array.from(new Set(keys.filter(Boolean)));

  if (uniq.length === 0) return [];

  // Firestore "in" حدها 10 قيم => نجزّئ
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 10) chunks.push(uniq.slice(i, i + 10));

  const uids = new Set<string>();
  for (const c of chunks) {
    const snap = await db
      .collection("users")
      .where("requestRecipientKey", "in", c)
      .get();
    snap.forEach((d) => uids.add(d.id));
  }

  return Array.from(uids);
}

async function resolveNotificationUids(
  requestData: Record<string, unknown>,
  requesterUid: string
): Promise<string[]> {
  const uids = new Set<string>();
  const addUid = (value: unknown) => {
    if (typeof value === "string" && value && value !== requesterUid) {
      uids.add(value);
    }
  };

  const currentAssigneeUid = requestData.currentAssigneeUid;
  const ccUids = Array.isArray(requestData.ccUids) ? requestData.ccUids : null;
  addUid(currentAssigneeUid);
  ccUids?.forEach(addUid);
  addUid(requestData.createdByUid);

  const legacyKeys: string[] = [];
  if (typeof currentAssigneeUid !== "string" || !currentAssigneeUid) {
    if (typeof requestData.currentAssigneeKey === "string") {
      legacyKeys.push(requestData.currentAssigneeKey);
    } else if (typeof requestData.mainRecipientKey === "string") {
      legacyKeys.push(requestData.mainRecipientKey);
    }
  }
  if (!ccUids) {
    const legacyCcKeys = Array.isArray(requestData.ccRecipientKeys)
      ? requestData.ccRecipientKeys.filter(
          (key): key is string => typeof key === "string"
        )
      : [];
    legacyKeys.push(...legacyCcKeys);
  }

  for (const uid of await resolveUidsByRecipientKeys(legacyKeys)) {
    addUid(uid);
  }

  return [...uids];
}

async function getTokensForUids(uids: string[]) {
  const { db } = getAdminServices();
  const all: { token: string; uid: string }[] = [];

  for (const uid of uids) {
    const snap = await db.collection("users").doc(uid).collection("fcmTokens").get();
    snap.forEach((d) => {
      const token = (d.data() as any)?.token || d.id; // انت مسمي docId=token
      if (token) all.push({ token, uid });
    });
  }
  return all;
}

export async function POST(req: NextRequest) {
  try {
    const requester = await getRequester(req);
    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const requestId = String(body?.requestId || "").trim();
    const title = String(body?.title || "").trim();
    const msg = String(body?.body || "").trim();
    const link = String(body?.link || "").trim();

    if (!requestId || !title || !link) {
      return Response.json(
        { error: "Missing requestId/title/link" },
        { status: 400 }
      );
    }

    // ✅ Authorization منطقي: لازم يكون منشئ الطلب أو HR+ أو الجهة الحالية
    const { db } = getAdminServices();
    const reqSnap = await db.collection("internalRequests").doc(requestId).get();
    if (!reqSnap.exists) {
      return Response.json({ error: "Request not found" }, { status: 404 });
    }
    const reqData = reqSnap.data() as any;

    const isHr =
      HR_ROLES.includes(requester.role as any);

    const myKey = await getMyRecipientKey(requester.uid);
    const actions = Array.isArray(reqData?.actions) ? reqData.actions : [];
    const latestAction = actions[actions.length - 1] as
      | { fromUid?: string }
      | undefined;
    const isLatestActionActor = latestAction?.fromUid === requester.uid;

    const can =
      isHr ||
      reqData?.createdByUid === requester.uid ||
      reqData?.currentAssigneeUid === requester.uid ||
      (myKey && reqData?.currentAssigneeKey === myKey) ||
      isLatestActionActor;

    if (!can) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetUids = await resolveNotificationUids(
      reqData as Record<string, unknown>,
      requester.uid
    );

    if (targetUids.length === 0) {
      return Response.json({ ok: true, sent: 0 });
    }

    const nowMs = Date.now();
    const nowTs = Timestamp.fromMillis(nowMs);

    const batch = db.batch();
    for (const uid of targetUids) {
      const ref = db.collection("users").doc(uid).collection("notifications").doc();
      const userRef = db.collection("users").doc(uid);
      batch.set(ref, {
        title,
        body: msg || "",
        type: "internal_request",
        link,
        createdAt: nowTs,
        createdAtMs: nowMs,
        read: false,
        requestId,
      });
      batch.set(userRef, { unreadNotificationsCount: FieldValue.increment(1) }, { merge: true });
    }

    await batch.commit();
    const tokenPairs = await getTokensForUids(targetUids);
const tokens = tokenPairs.map((x) => x.token);

if (tokens.length) {
  const messaging = getMessaging();

  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body: msg || "",
    },
    data: {
      link,              // مهم للـ SW
      requestId,
      type: "internal_request",
    },
    webpush: {
      fcmOptions: { link }, // يساعد بعض المتصفحات
      notification: {
        icon: "https://YOUR_DOMAIN/icons/icon-192.png",
      },
    },
  });

  // تنظيف التوكنز المعطوبة
  const { db } = getAdminServices();
  const bad: Array<{ uid: string; token: string }> = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const { uid, token } = tokenPairs[i];
      bad.push({ uid, token });
    }
  });

  for (const b of bad) {
    await db.collection("users").doc(b.uid).collection("fcmTokens").doc(b.token).delete().catch(() => {});
  }
}
    return Response.json({ ok: true, sent: targetUids.length });
  } catch (e: any) {
    console.error("fanout-request error:", e);
    return Response.json(
      { error: e?.message || "Fanout failed" },
      { status: 500 }
    );
  }
}
// app/api/fanout-request/route.ts
