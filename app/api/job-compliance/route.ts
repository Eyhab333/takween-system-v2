export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { ACTIVE_JOB_COMPLIANCE_RESOURCES } from "@/lib/job-compliance-resources";
import { getAdminServices } from "@/lib/server/firebaseAdmin";
import {
  audienceMatchesUser,
  buildAudienceTokensFromUser,
  documentAudienceTokens,
} from "@/lib/audience-tokens";

const HR_ROLES = ["hr", "chairman", "ceo", "admin", "superadmin"] as const;
const SIGNED_URL_TTL_MS = 30 * 60 * 1000;

type Requester = {
  uid: string;
  role: string;
};

type ComplianceResource = {
  key: string;
  title: string;
  category: string;
  version: string;
  storagePath: string;
  requiresAcknowledgement: boolean;
  sortOrder: number;
  audTokens: string[];
};

function isHrOrAbove(role: string) {
  return HR_ROLES.includes(role as (typeof HR_ROLES)[number]);
}

function isSafeUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes("/")
  );
}

async function getRequester(req: NextRequest): Promise<Requester | null> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) return null;

  const { auth } = getAdminServices();
  const decoded = await auth.verifyIdToken(match[1], true);

  return {
    uid: decoded.uid,
    role: (decoded.role as string | undefined) || "employee",
  };
}

function asIsoDate(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as { toDate?: () => Date };
  const date = candidate.toDate?.();

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function noStoreJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getStorageBucketName() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    ""
  ).trim();
}

function asComplianceResource(
  key: string,
  data: Record<string, unknown>,
): ComplianceResource {
  return {
    key,
    title: String(data.title || ""),
    category: String(data.category || ""),
    version: String(data.version || ""),
    storagePath: String(data.storagePath || ""),
    requiresAcknowledgement: data.requiresAcknowledgement !== false,
    audTokens: documentAudienceTokens(data),
    sortOrder:
      typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
        ? data.sortOrder
        : 0,
  };
}

async function getEmployeeResources(uid: string) {
  const { db } = getAdminServices();
  const userSnapshot = await db.doc(`users/${uid}`).get();
  if (!userSnapshot.exists) return [];

  const userTokens = buildAudienceTokensFromUser(
    userSnapshot.data() as Record<string, unknown>,
  );
  const snapshot = await db.collection("jobComplianceDocuments").get();
  const managedResources = snapshot.docs.map((document) => ({
    resource: asComplianceResource(
      document.id,
      document.data() as Record<string, unknown>,
    ),
    active: document.data().active === true,
  }));

  return managedResources
    .filter(({ active }) => active)
    .map(({ resource }) => resource)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

async function getActiveResources() {
  const { db } = getAdminServices();
  const snapshot = await db.collection("jobComplianceDocuments").get();
  const managedResources = snapshot.docs.map((document) => ({
    resource: asComplianceResource(
      document.id,
      document.data() as Record<string, unknown>,
    ),
    active: document.data().active === true,
  }));
  const managedKeys = new Set(
    managedResources.map(({ resource }) => resource.key),
  );

  return [
    ...managedResources
      .filter(({ active }) => active)
      .map(({ resource }) => resource),
    ...ACTIVE_JOB_COMPLIANCE_RESOURCES.filter(
      (resource) => !managedKeys.has(resource.key),
    ),
  ].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function GET(req: NextRequest) {
  try {
    const requester = await getRequester(req);
    if (!requester) {
      return noStoreJson({ error: "غير مصرح" }, 401);
    }

    const uid = new URL(req.url).searchParams.get("uid");
    if (!isSafeUid(uid)) {
      return noStoreJson({ error: "معرف الموظف غير صالح" }, 400);
    }

    if (requester.uid !== uid && !isHrOrAbove(requester.role)) {
      return noStoreJson({ error: "غير مصرح بالوصول إلى هذا الملف" }, 403);
    }

    const bucketName = getStorageBucketName();
    if (!bucketName) {
      return noStoreJson(
        { error: "إعدادات مساحة تخزين الملفات غير مكتملة" },
        500,
      );
    }

    const activeResources = await getEmployeeResources(uid);
    const { db, storage } = getAdminServices();
    const acknowledgementRefs = activeResources.map((resource) =>
      db.doc(`users/${uid}/jobComplianceAcknowledgements/${resource.key}`),
    );
    const acknowledgementSnapshots = acknowledgementRefs.length
      ? await db.getAll(...acknowledgementRefs)
      : [];
    const acknowledgements = new Map(
      acknowledgementSnapshots.map((snapshot) => [
        snapshot.id,
        snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null,
      ]),
    );

    const bucket = storage.bucket(bucketName);
    const resources = await Promise.all(
      activeResources.map(async (resource) => {
        const [fileUrl] = await bucket.file(resource.storagePath).getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + SIGNED_URL_TTL_MS,
        });
        const acknowledgement = acknowledgements.get(resource.key);

        return {
          key: resource.key,
          title: resource.title,
          category: resource.category,
          version: resource.version,
          requiresAcknowledgement: resource.requiresAcknowledgement,
          storagePath: resource.storagePath,
          fileUrl,
          acknowledged: acknowledgement?.acknowledged === true,
          acknowledgedAt: asIsoDate(acknowledgement?.acknowledgedAt),
          acknowledgementVersion:
            typeof acknowledgement?.version === "string"
              ? acknowledgement.version
              : null,
        };
      }),
    );

    return noStoreJson({ ok: true, resources });
  } catch (error: unknown) {
    console.error("job-compliance GET error:", error);
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحميل الالتزام الوظيفي",
      },
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const requester = await getRequester(req);
    if (!requester) {
      return noStoreJson({ error: "غير مصرح" }, 401);
    }

    const body = (await req.json()) as { uid?: unknown; resourceKey?: unknown };
    const { uid, resourceKey } = body;

    if (!isSafeUid(uid) || typeof resourceKey !== "string") {
      return noStoreJson({ error: "البيانات المرسلة غير صالحة" }, 400);
    }

    // An acknowledgement is a personal employee declaration, including for HR users.
    if (requester.uid !== uid) {
      return noStoreJson({ error: "لا يمكن الإقرار نيابة عن موظف آخر" }, 403);
    }

    const resource = (await getEmployeeResources(uid)).find(
      (item) => item.key === resourceKey,
    );
    if (!resource) {
      return noStoreJson({ error: "ملف الالتزام غير متاح" }, 400);
    }

    const { db } = getAdminServices();
    const acknowledgementRef = db.doc(
      `users/${uid}/jobComplianceAcknowledgements/${resource.key}`,
    );

    const alreadyAcknowledged = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(acknowledgementRef);
      if (existing.exists) return true;

      transaction.set(acknowledgementRef, {
        resourceKey: resource.key,
        title: resource.title,
        category: resource.category,
        version: resource.version,
        storagePath: resource.storagePath,
        acknowledged: true,
        acknowledgedAt: FieldValue.serverTimestamp(),
        acknowledgedByUid: requester.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return false;
    });

    return noStoreJson({ ok: true, alreadyAcknowledged });
  } catch (error: unknown) {
    console.error("job-compliance POST error:", error);
    return noStoreJson(
      { error: error instanceof Error ? error.message : "تعذر حفظ الإقرار" },
      500,
    );
  }
}
