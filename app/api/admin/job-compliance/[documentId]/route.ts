export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/server/firebaseAdmin";
import {
  audienceMatchesUser,
  buildAudienceTokensFromUser,
  documentAudienceTokens,
  normalizeAudienceTokens,
} from "@/lib/audience-tokens";

const MANAGER_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;

type Requester = { uid: string; role: string };

function isManagerRole(role: string) {
  return MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number]);
}

function isSafeDocumentId(value: string) {
  return value.length > 0 && value.length <= 1500 && !value.includes("/");
}

async function getRequester(req: NextRequest): Promise<Requester | null> {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  const { auth } = getAdminServices();
  const decoded = await auth.verifyIdToken(match[1], true);
  return { uid: decoded.uid, role: (decoded.role as string | undefined) || "employee" };
}

function toIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const date = (value as { toDate?: () => Date }).toDate?.();
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

// The dashboard uses tags containing "staff" for employee totals. Common inactive
// markers are also excluded when present, without assuming they exist for every user.
function isActiveStaffUser(user: Record<string, unknown>) {
  return Array.isArray(user.tags) && user.tags.includes("staff") && user.active !== false && user.disabled !== true && user.status !== "inactive";
}

async function getTargetEmployees() {
  const { db } = getAdminServices();
  const snapshot = await db.collection("users").get();
  const users: Array<Record<string, unknown> & { uid: string }> = snapshot.docs.map(
    (doc) => {
      const data = doc.data() as Record<string, unknown>;
      return { ...data, uid: doc.id };
    },
  );

  return users
    .filter(isActiveStaffUser)
    .map((user) => ({
      uid: user.uid,
      name: typeof user.name === "string" ? user.name : typeof user.displayName === "string" ? user.displayName : "",
      email: typeof user.email === "string" ? user.email : "",
      role: typeof user.role === "string" ? user.role : "employee",
      audTokens: buildAudienceTokensFromUser(user),
    }));
}

async function getAcknowledgedUids(
  employees: Array<{ uid: string }>,
  documentId: string,
  version: string,
) {
  const { db } = getAdminServices();
  const acknowledgementRefs = employees.map((employee) =>
    db.doc(`users/${employee.uid}/jobComplianceAcknowledgements/${documentId}`),
  );
  const snapshots = acknowledgementRefs.length
    ? await db.getAll(...acknowledgementRefs)
    : [];
  const result = new Map<string, string | null>();
  for (const acknowledgement of snapshots) {
    if (!acknowledgement.exists) continue;
    const data = acknowledgement.data() as Record<string, unknown>;
    if (typeof data.version === "string" && data.version !== version) continue;
    const uid = acknowledgement.ref.parent.parent?.id;
    if (uid) result.set(uid, toIso(data.acknowledgedAt));
  }
  return result;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const requester = await getRequester(req);
    if (!requester || !isManagerRole(requester.role)) {
      return Response.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { documentId } = await context.params;
    if (!isSafeDocumentId(documentId)) return Response.json({ error: "معرف المستند غير صالح" }, { status: 400 });

    const { db } = getAdminServices();
    const documentSnapshot = await db.collection("jobComplianceDocuments").doc(documentId).get();
    if (!documentSnapshot.exists) return Response.json({ error: "المستند غير موجود" }, { status: 404 });

    const document = documentSnapshot.data() as Record<string, unknown>;
    const employees = await getTargetEmployees();
    const targetEmployees = employees.filter((employee) =>
      audienceMatchesUser(documentAudienceTokens(document), employee.audTokens),
    );
    const acknowledgementDates = await getAcknowledgedUids(
      targetEmployees,
      documentId,
      String(document.version || ""),
    );
    const acknowledgedUids = new Set(acknowledgementDates.keys());
    const employeeStatuses = targetEmployees.map((employee) => ({
      ...employee,
      acknowledged: acknowledgedUids.has(employee.uid),
      acknowledgedAt: acknowledgementDates.get(employee.uid) || null,
    }));
    const acknowledgedEmployees = employeeStatuses.filter((employee) => employee.acknowledged);
    const pendingEmployees = employeeStatuses.filter((employee) => !employee.acknowledged);

    return Response.json(
      {
        ok: true,
        document: {
          id: documentSnapshot.id,
          ...document,
          createdAt: toIso(document.createdAt),
          updatedAt: toIso(document.updatedAt),
        },
        totalTargetEmployees: targetEmployees.length,
        acknowledgedCount: acknowledgedEmployees.length,
        pendingCount: pendingEmployees.length,
        employeeStatuses,
        acknowledgedEmployees,
        pendingEmployees,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("admin job-compliance detail GET error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "تعذر تحميل تفاصيل المستند" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const requester = await getRequester(req);
    if (!requester || !isManagerRole(requester.role)) {
      return Response.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { documentId } = await context.params;
    if (!isSafeDocumentId(documentId)) return Response.json({ error: "معرف المستند غير صالح" }, { status: 400 });

    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (typeof body.active === "boolean") updates.active = body.active;
    if (typeof body.requiresAcknowledgement === "boolean") updates.requiresAcknowledgement = body.requiresAcknowledgement;
    for (const field of ["title", "category", "version"] as const) {
      if (typeof body[field] === "string" && body[field].trim()) updates[field] = body[field].trim();
    }
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) updates.sortOrder = body.sortOrder;
    if (body.audienceMode === "all") {
      updates.audienceMode = "all";
      updates.audTokens = ["all:all"];
    }
    if (body.audienceMode === "selected") {
      const audTokens = normalizeAudienceTokens(body.audTokens);
      if (audTokens.length === 0) {
        return Response.json({ error: "يرجى تحديد الفئة المستهدفة" }, { status: 400 });
      }
      updates.audienceMode = "selected";
      updates.audTokens = audTokens;
    }
    if (Object.keys(updates).length === 0) return Response.json({ error: "لا توجد تعديلات صالحة" }, { status: 400 });

    const { db } = getAdminServices();
    const documentRef = db.collection("jobComplianceDocuments").doc(documentId);
    const existing = await documentRef.get();
    if (!existing.exists) return Response.json({ error: "المستند غير موجود" }, { status: 404 });

    await documentRef.update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: requester.uid,
    });
    const updated = await documentRef.get();
    const data = updated.data() as Record<string, unknown>;

    return Response.json({
      ok: true,
      document: { id: updated.id, ...data, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) },
    });
  } catch (error: unknown) {
    console.error("admin job-compliance PATCH error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "تعذر تحديث المستند" }, { status: 500 });
  }
}
