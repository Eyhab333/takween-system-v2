// lib/internal-requests/firestore.ts
"use client"

import {
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import type { Role } from "@/lib/roles"
import type {
  RequestType,
  InternalRequest,
  RequestActionType,
  RequestStatus,
} from "./types"

const COLLECTION_NAME = "internalRequests"

// Helper عام يحوّل data + id إلى InternalRequest
function mapDataToInternalRequest(id: string, data: any): InternalRequest {
  const rawActions: any[] = Array.isArray(data.actions) ? data.actions : []

  return {
    id,
    title: data.title ?? "",
    type: data.type ?? "general",
    description: data.description ?? "",

    createdByUid: data.createdByUid,
    createdByEmail: data.createdByEmail ?? null,
    createdByDept: data.createdByDept ?? null,

    status: data.status ?? "open",

    currentAssignee: {
      uid: data.currentAssignee?.uid ?? null,
      role: data.currentAssignee?.role ?? null,
    },

    createdAt: data.createdAt?.toDate?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.() ?? null,

    archived: data.archived ?? false,
    pdfUrl: data.pdfUrl ?? null,

    actions: rawActions.map((a) => {
      const rawAt = a?.at
      let at: Date | null = null

      if (rawAt && typeof (rawAt as any).toDate === "function") {
        at = (rawAt as any).toDate()
      } else if (rawAt instanceof Date) {
        at = rawAt
      } else {
        at = null
      }

      return {
        ...a,
        at,
      }
    }),
  }
}

// تحويل مستند Firestore (query) إلى InternalRequest
function mapDocToInternalRequest(
  docSnap: QueryDocumentSnapshot<DocumentData>
): InternalRequest {
  const data = docSnap.data() as any
  return mapDataToInternalRequest(docSnap.id, data)
}

// المدخلات المطلوبة لإنشاء طلب جديد
export type CreateInternalRequestInput = {
  title: string
  type: RequestType
  description: string

  createdByUid: string
  createdByEmail?: string | null
  createdByRole: Role | null
  createdByDept?: string | null

  // المستلم الأول للطلب (مثلاً المدير التنفيذي)
  initialAssigneeUid: string | null
  initialAssigneeRole: Role | null
}

/**
 * إنشاء طلب داخلي جديد في Firestore
 * - يسجّل الطلب نفسه
 * - يسجّل أول حركة (submitted) في actions
 */
export async function createInternalRequest(input: CreateInternalRequestInput) {
  const now = new Date()

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    title: input.title,
    type: input.type,
    description: input.description,

    createdByUid: input.createdByUid,
    createdByEmail: input.createdByEmail ?? null,
    createdByDept: input.createdByDept ?? null,

    status: "open",
    currentAssignee: {
      uid: input.initialAssigneeUid,
      role: input.initialAssigneeRole,
    },

    archived: false,
    pdfUrl: null,

    actions: [
      {
        at: now, // Date محلي
        fromUid: input.createdByUid,
        fromRole: input.createdByRole,
        toUid: input.initialAssigneeUid,
        toRole: input.initialAssigneeRole,
        actionType: "submitted",
        comment: "",
      },
    ],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return docRef.id
}

/**
 * الاستماع لطلبات المستخدم نفسه (طلباتي)
 */
export function listenMyRequests(
  uid: string,
  cb: (requests: InternalRequest[]) => void
) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("createdByUid", "==", uid),
    orderBy("createdAt", "desc")
  )

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(mapDocToInternalRequest)
    cb(items)
  })
}

/**
 * الاستماع للطلبات الموجّهة لدور معيّن (مثلاً ceo)
 * نفلتر الحالات النشطة في الكلاينت (open + in_progress)
 */
export function listenAssignedRequestsByRole(
  role: Role,
  cb: (requests: InternalRequest[]) => void
) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("currentAssignee.role", "==", role),
    orderBy("createdAt", "desc")
  )

  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(mapDocToInternalRequest)
    const active = all.filter((r) =>
      ["open", "in_progress"].includes(r.status)
    )
    cb(active)
  })
}

/**
 * الاستماع لطلب واحد بالتحديد حسب الـ id
 */
export function listenInternalRequestById(
  id: string,
  cb: (request: InternalRequest | null) => void
) {
  const ref = doc(db, COLLECTION_NAME, id)

  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb(null)
      return
    }
    const data = snap.data() as any
    cb(mapDataToInternalRequest(snap.id, data))
  })
}

// ========= تنفيذ إجراء على الطلب (موافقة / رفض / إحالة / تعليق / إغلاق) =========

export type PerformRequestActionInput = {
  requestId: string
  actionType: RequestActionType
  actorUid: string
  actorRole: Role | null
  comment?: string

  // للإحالة (forwarded) أو تغيير المسؤول
  targetUid?: string | null
  targetRole?: Role | null

  // لو عاوز تفرض حالة معيّنة (وإلا هنستنتج حسب نوع الحركة)
  newStatus?: RequestStatus | null
}

/**
 * يضيف Action جديد للطلب + يحدّث الحالة والمسؤول الحالي
 * وبعدها يرسل إشعارات للمستلمين المناسبين عبر API داخلية
 */
export async function performRequestAction(input: PerformRequestActionInput) {
  const ref = doc(db, COLLECTION_NAME, input.requestId)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    throw new Error("الطلب غير موجود")
  }

  const data = snap.data() as any
  const now = new Date()

  const existingActions: any[] = Array.isArray(data.actions) ? data.actions : []

  // استنتاج الحالة الجديدة لو ماجتش صراحة
  let status: RequestStatus = (data.status as RequestStatus) ?? "open"

  if (input.newStatus) {
    status = input.newStatus
  } else {
    switch (input.actionType) {
      case "forwarded":
        status = "in_progress"
        break
      case "approved":
        status = "approved"
        break
      case "rejected":
        status = "rejected"
        break
      case "closed":
        status = "closed"
        break
      case "comment":
      case "submitted":
      case "generated_pdf":
      default:
        // لا تغيّر الحالة
        break
    }
  }

  // استنتاج المسؤول الحالي الجديد
  let currentAssignee = data.currentAssignee || { uid: null, role: null }

  if (input.actionType === "forwarded") {
    currentAssignee = {
      uid: input.targetUid ?? null,
      role: input.targetRole ?? null,
    }
  } else if (["approved", "rejected", "closed"].includes(input.actionType)) {
    // بعد الاعتماد/الرفض/الإغلاق نعتبر مفيش أحد ماسك الطلب
    currentAssignee = {
      uid: null,
      role: null,
    }
  }

  const newAction = {
    at: now,
    fromUid: input.actorUid,
    fromRole: input.actorRole,
    toUid: input.targetUid ?? null,
    toRole: input.targetRole ?? null,
    actionType: input.actionType,
    comment: input.comment ?? "",
  }

  const updatedActions = [...existingActions, newAction]

  // 🟦 تحديث الطلب في Firestore
  await updateDoc(ref, {
    status,
    currentAssignee,
    actions: updatedActions,
    updatedAt: serverTimestamp(),
  })

  // 🟢 بعد نجاح التحديث → نرسل إشعارات عبر API
  try {
    const token = await auth.currentUser?.getIdToken()
    if (token) {
      await fetch("/api/internal-requests/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId: input.requestId,
          actionType: input.actionType,
          actorUid: input.actorUid,
          actorRole: input.actorRole,
          targetRole: input.targetRole ?? null,
          targetUid: input.targetUid ?? null,
        }),
      })
    }
  } catch (e) {
    console.warn("internal-requests notify failed", e)
  }
}
