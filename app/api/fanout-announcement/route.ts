export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, WriteBatch } from "firebase-admin/firestore";

type Requester = {
  uid: string;
  role: string;
};

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
        "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY",
      );
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

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

function parseAudience(audTokens: string[]) {
  const schools: string[] = [];
  const units: string[] = [];
  const roles: string[] = [];
  const tags: string[] = [];
  const schoolTypes: string[] = [];

  for (const tok of audTokens) {
    if (tok.startsWith("schoolKey:")) schools.push(tok.split(":")[1]);
    else if (tok.startsWith("unit:")) units.push(tok.split(":")[1]);
    else if (tok.startsWith("role:")) roles.push(tok.split(":")[1]);
    else if (tok.startsWith("tag:")) tags.push(tok.split(":")[1]);
    else if (tok.startsWith("schoolType:")) schoolTypes.push(tok.split(":")[1]);
  }

  return { schools, units, roles, tags, schoolTypes };
}

async function resolveAudienceUserIds(audTokens: string[]) {
  const { db } = getAdminServices();
  const uids = new Set<string>();

  if (audTokens.includes("all:all")) {
    const snap = await db.collection("users").get();
    snap.forEach((d) => uids.add(d.id));
    return Array.from(uids);
  }

  const { schools, units, roles, tags, schoolTypes } = parseAudience(audTokens);
  const jobs: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

  for (const school of schools) {
    jobs.push(db.collection("users").where("schoolKey", "==", school).get());
  }

  for (const unit of units) {
    jobs.push(db.collection("users").where("unit", "==", unit).get());
  }

  for (const role of roles) {
    jobs.push(db.collection("users").where("role", "==", role).get());
  }

  for (const tag of tags) {
    jobs.push(db.collection("users").where("tags", "array-contains", tag).get());
  }

  for (const schoolType of schoolTypes) {
    jobs.push(
      db.collection("users").where("schoolType", "==", schoolType).get(),
    );
  }

  const snaps = await Promise.all(jobs);
  for (const snap of snaps) {
    snap.forEach((d) => uids.add(d.id));
  }

  return Array.from(uids);
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