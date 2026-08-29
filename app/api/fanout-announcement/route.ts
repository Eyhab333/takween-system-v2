export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Timestamp, WriteBatch } from "firebase-admin/firestore";

import {
  audienceMatchesUser,
  buildAudienceTokensFromUser,
  documentAudienceTokens,
} from "@/lib/audience-tokens";
import { getAdminServices } from "@/lib/server/firebaseAdmin";

type Requester = {
  uid: string;
  role: string;
};

async function getRequester(req: NextRequest): Promise<Requester | null> {
  const { auth } = getAdminServices();

  const sessionCookie = req.cookies.get("session")?.value;
  if (sessionCookie) {
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    return {
      uid: decoded.uid,
      role: (decoded.role as string | undefined) || "employee",
    };
  }

  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) {
    const decoded = await auth.verifyIdToken(match[1], true);
    return {
      uid: decoded.uid,
      role: (decoded.role as string | undefined) || "employee",
    };
  }

  return null;
}

async function resolveAudienceUserIds(audTokens: string[]) {
  const { db } = getAdminServices();
  const documentTokens = documentAudienceTokens({ audTokens });
  const snapshot = await db.collection("users").get();

  return snapshot.docs.flatMap((document) => {
    const userTokens = buildAudienceTokensFromUser(
      document.data() as Record<string, unknown>,
      document.id,
    );
    return audienceMatchesUser(documentTokens, userTokens) ? [document.id] : [];
  });
}

async function commitNotificationBatches(params: {
  userIds: string[];
  annId: string;
  title: string;
}) {
  const { db } = getAdminServices();

  const nowMs = Date.now();
  const nowTs = Timestamp.fromMillis(nowMs);

  let sent = 0;
  let batch: WriteBatch = db.batch();
  let count = 0;

  for (const uid of params.userIds) {
    const ref = db.collection("users").doc(uid).collection("notifications").doc();

    batch.set(ref, {
      title: "تعميم جديد",
      body: params.title,
      type: "announcement",
      link: "/announcements",
      createdAt: nowTs,
      createdAtMs: nowMs,
      read: false,
      annId: params.annId,
    });

    count += 1;
    sent += 1;

    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  return sent;
}

export async function POST(req: NextRequest) {
  try {
    const requester = await getRequester(req);

    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (requester.role !== "superadmin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const annId = String(body?.annId || "").trim();
    const title = String(body?.title || "").trim();
    const audTokens = Array.isArray(body?.audTokens)
      ? body.audTokens.filter((x: unknown) => typeof x === "string")
      : [];

    if (!annId || !title || audTokens.length === 0) {
      return Response.json(
        { error: "Missing annId/title/audTokens" },
        { status: 400 },
      );
    }

    const userIds = await resolveAudienceUserIds(audTokens);

    if (userIds.length === 0) {
      return Response.json({ ok: true, sent: 0 });
    }

    const sent = await commitNotificationBatches({
      userIds,
      annId,
      title,
    });

    return Response.json({ ok: true, sent });
  } catch (e: any) {
    console.error("fanout-announcement error:", e);
    return Response.json(
      { error: e?.message || "Fanout failed" },
      { status: 500 },
    );
  }
}
