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
const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;

type Requester = { uid: string; role: string };
type ComplianceDocument = {
  id: string;
  title: string;
  category: string;
  version: string;
  storagePath: string;
  active: boolean;
  requiresAcknowledgement: boolean;
  sortOrder: number;
  audienceMode: "all" | "selected";
  audTokens: string[];
  createdAt: string | null;
  updatedAt: string | null;
  createdByUid: string | null;
  updatedByUid: string | null;
};

function isManagerRole(role: string) {
  return MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number]);
}

async function getRequester(req: NextRequest): Promise<Requester | null> {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  const { auth } = getAdminServices();
  const decoded = await auth.verifyIdToken(match[1], true);
  return { uid: decoded.uid, role: (decoded.role as string | undefined) || "employee" };
}

async function requireManager(req: NextRequest) {
  const requester = await getRequester(req);
  return requester && isManagerRole(requester.role) ? requester : null;
}

function toIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const date = (value as { toDate?: () => Date }).toDate?.();
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function toDocument(id: string, value: Record<string, unknown>): ComplianceDocument {
  return {
    id,
    title: String(value.title || ""),
    category: String(value.category || ""),
    version: String(value.version || ""),
    storagePath: String(value.storagePath || ""),
    active: value.active === true,
    requiresAcknowledgement: value.requiresAcknowledgement !== false,
    sortOrder: typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder) ? value.sortOrder : 0,
    audienceMode: value.audienceMode === "selected" ? "selected" : "all",
    audTokens: documentAudienceTokens(value),
    createdAt: toIso(value.createdAt),
    updatedAt: toIso(value.updatedAt),
    createdByUid: typeof value.createdByUid === "string" ? value.createdByUid : null,
    updatedByUid: typeof value.updatedByUid === "string" ? value.updatedByUid : null,
  };
}

function getStorageBucketName() {
  return (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
}

function sanitizeFileName(fileName: string) {
  const safeName = fileName
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safeName || "document.pdf";
}

function isPdf(file: File) {
  return !file.type || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

// The dashboard uses tags containing "staff" for employee totals. Common inactive
// markers are also excluded when present, without assuming they exist for every user.
function isActiveStaffUser(user: Record<string, unknown>) {
  return Array.isArray(user.tags) && user.tags.includes("staff") && user.active !== false && user.disabled !== true && user.status !== "inactive" && user.employmentStatus !== "inactive";
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
  const result = new Set<string>();
  for (const acknowledgement of snapshots) {
    if (!acknowledgement.exists) continue;
    const data = acknowledgement.data() as Record<string, unknown>;
    if (typeof data.version === "string" && data.version !== version) continue;
    const uid = acknowledgement.ref.parent.parent?.id;
    if (uid) result.add(uid);
  }
  return result;
}

async function getDocumentProgress(document: ComplianceDocument) {
  const employees = await getTargetEmployees();
  const acknowledgedUids = await getAcknowledgedUids(
    employees,
    document.id,
    document.version,
  );
  const targetEmployees = employees.filter(
    (employee) =>
      !!employee.uid && audienceMatchesUser(document.audTokens, employee.audTokens),
  );
  const acknowledgedCount = targetEmployees.filter((employee) => acknowledgedUids.has(employee.uid)).length;
  return {
    totalTargetEmployees: targetEmployees.length,
    acknowledgedCount,
    pendingCount: targetEmployees.length - acknowledgedCount,
  };
}

export async function GET(req: NextRequest) {
  try {
    const requester = await requireManager(req);
    if (!requester) return Response.json({ error: "غير مصرح" }, { status: 403 });

    const { db } = getAdminServices();
    const snapshot = await db.collection("jobComplianceDocuments").get();
    const documents = snapshot.docs
      .map((doc) => toDocument(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : (b.createdAt || "").localeCompare(a.createdAt || ""));
    const documentsWithProgress = await Promise.all(
      documents.map(async (document) => ({ ...document, ...(await getDocumentProgress(document)) })),
    );

    return Response.json(
      { ok: true, documents: documentsWithProgress },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("admin job-compliance GET error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "تعذر تحميل المستندات" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const requester = await requireManager(req);
    if (!requester) return Response.json({ error: "غير مصرح" }, { status: 403 });

    const formData = await req.formData();
    const title = String(formData.get("title") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const version = String(formData.get("version") || "").trim();
    const sortOrder = Number(formData.get("sortOrder"));
    const requiresAcknowledgement = formData.get("requiresAcknowledgement") === "true";
    const audienceMode = formData.get("audienceMode") === "selected" ? "selected" : "all";
    let audTokens: string[] = [];
    try {
      audTokens = normalizeAudienceTokens(JSON.parse(String(formData.get("audTokens") || "[]")));
    } catch {
      return Response.json({ error: "الفئة المستهدفة غير صالحة" }, { status: 400 });
    }

    if (audienceMode === "all") audTokens = ["all:all"];
    if (audienceMode === "selected" && audTokens.length === 0) {
      return Response.json({ error: "يرجى تحديد الفئة المستهدفة" }, { status: 400 });
    }
    const file = formData.get("file");

    if (!title || !category || !version || !Number.isFinite(sortOrder)) {
      return Response.json({ error: "يرجى استكمال بيانات المستند" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "يرجى اختيار ملف PDF" }, { status: 400 });
    }
    if (!isPdf(file)) return Response.json({ error: "الملف يجب أن يكون بصيغة PDF" }, { status: 400 });
    if (file.size > MAX_PDF_SIZE_BYTES) {
      return Response.json({ error: "حجم ملف PDF يجب ألا يتجاوز 15 ميجابايت" }, { status: 400 });
    }

    const bucketName = getStorageBucketName();
    if (!bucketName) return Response.json({ error: "إعدادات مساحة تخزين الملفات غير مكتملة" }, { status: 500 });

    const { db, storage } = getAdminServices();
    const documentRef = db.collection("jobComplianceDocuments").doc();
    const storagePath = `job-compliance/${documentRef.id}-${sanitizeFileName(file.name)}`;
    const storageFile = storage.bucket(bucketName).file(storagePath);
    await storageFile.save(Buffer.from(await file.arrayBuffer()), {
      resumable: false,
      metadata: { contentType: "application/pdf" },
    });

    try {
      await documentRef.set({
        title,
        category,
        version,
        storagePath,
        active: true,
        requiresAcknowledgement,
        sortOrder,
        audienceMode,
        audTokens,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdByUid: requester.uid,
        updatedByUid: requester.uid,
      });
    } catch (writeError) {
      await storageFile.delete().catch(() => undefined);
      throw writeError;
    }

    const created = await documentRef.get();
    return Response.json({ ok: true, document: toDocument(documentRef.id, created.data() as Record<string, unknown>) });
  } catch (error: unknown) {
    console.error("admin job-compliance POST error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "تعذر رفع المستند" }, { status: 500 });
  }
}
