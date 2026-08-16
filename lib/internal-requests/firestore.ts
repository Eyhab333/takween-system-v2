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
  getDocs,
  updateDoc,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Role } from "@/lib/roles"
import type {
  RequestType,
  InternalRequest,
  RequestActionType,
  RequestStatus,
} from "./types"
import {
  type RequestRecipientKey,
  getRecipientByKey,
} from "./recipients"

const COLLECTION_NAME = "internalRequests"
const COUNTERS_COLLECTION = "internalRequestCounters"

// ===================== Helpers (Hybrid) =====================

async function resolveCcUidsByRecipientKeys(keys: RequestRecipientKey[]) {
  const unique = Array.from(new Set(keys)).filter(Boolean) as RequestRecipientKey[]
  if (unique.length === 0) return []

  // Firestore "in" supports up to 30 values عادة، وإنت عندك max 16
  const qy = query(
    collection(db, "users"),
    where("requestRecipientKey", "in", unique)
  )

  const snap = await getDocs(qy)
  const out: string[] = []
  snap.forEach((d) => out.push(d.id))
  return Array.from(new Set(out))
}

// ===================== Mappers =====================

// Helper عام يحوّل data + id إلى InternalRequest
export function mapDataToInternalRequest(id: string, data: any): InternalRequest {
  const rawActions: any[] = Array.isArray(data.actions) ? data.actions : []

  const req: any = {
    id,
    title: data.title ?? "",
    type: data.type ?? "general",
    description: data.description ?? "",

    createdByUid: data.createdByUid,
    createdByEmail: data.createdByEmail ?? null,
    createdByDept: data.createdByDept ?? null,

    status: (data.status as RequestStatus) ?? "open",

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

  // حقول إضافية خاصة بالجهات والرقم
  req.mainRecipientKey = data.mainRecipientKey ?? null
  req.mainRecipientLabel = data.mainRecipientLabel ?? null
  req.mainRecipientNumber = data.mainRecipientNumber ?? null
  req.sequenceForRecipient = data.sequenceForRecipient ?? null
  req.requestNumber = data.requestNumber ?? null
  req.ccRecipientKeys = Array.isArray(data.ccRecipientKeys) ? data.ccRecipientKeys : []

  req.currentAssigneeKey = data.currentAssigneeKey ?? null
  req.currentAssigneeLabel = data.currentAssigneeLabel ?? null

  // ✅ Hybrid fields
  req.currentAssigneeUid = data.currentAssigneeUid ?? null
  req.ccUids = Array.isArray(data.ccUids) ? data.ccUids : []
  req.attachments = Array.isArray(data.attachments) ? data.attachments : []

  // attachments
  const rawAtt: any[] = Array.isArray(data.attachments) ? data.attachments : []
  req.attachments = rawAtt.map((x) => ({
    name: x?.name ?? "file",
    size: Number(x?.size ?? 0),
    contentType: x?.contentType ?? "application/octet-stream",
    url: x?.url ?? "",
    path: x?.path ?? "",
    uploadedByUid: x?.uploadedByUid ?? null,
    uploadedByLabel: x?.uploadedByLabel ?? null,
    uploadedAtMs: typeof x?.uploadedAtMs === "number" ? x.uploadedAtMs : undefined,
  }))


  return req as InternalRequest
}

// تحويل مستند Firestore (query) إلى InternalRequest
function mapDocToInternalRequest(
  docSnap: QueryDocumentSnapshot<DocumentData>
): InternalRequest {
  const data = docSnap.data() as any
  return mapDataToInternalRequest(docSnap.id, data)
}

// ===================== Old create (kept) =====================

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
 * (قديمة) إنشاء طلب داخلي بدون رقم خاص بالجهة
 * — يفضّل استخدام createInternalRequestWithNumber بدلاً منها
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
    currentAssigneeUid: input.initialAssigneeUid ?? null,

    archived: false,
    pdfUrl: null,

    // مفيش رقم طلب هنا
    mainRecipientKey: null,
    mainRecipientLabel: null,
    mainRecipientNumber: null,
    sequenceForRecipient: null,
    requestNumber: null,

    ccRecipientKeys: [],
    ccUids: [],

    currentAssigneeKey: null,
    currentAssigneeLabel: null,

    attachments: [],

    actions: [
      {
        at: now, // Date محلي
        fromUid: input.createdByUid,
        fromRole: input.createdByRole,
        toUid: input.initialAssigneeUid,
        toRole: input.initialAssigneeRole,
        toRecipientKey: null,
        actionType: "submitted",
        comment: "",
      },
    ],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return docRef.id
}

// ===================== New create with per-recipient number (Hybrid) =====================

export type CreateInternalRequestWithNumberInput = {
  title: string
  type: RequestType
  description: string

  createdByUid: string
  createdByEmail?: string | null
  createdByRole: Role | null
  createdByDept?: string | null

  // ✅ NEW: بيانات منشئ الطلب كجهة
  createdByRecipientKey?: RequestRecipientKey | null
  createdByLabel?: string | null

  mainRecipient: {
    uid: string
    role: Role | null
    label: string
    orgUnitId: string
    positionCode: string
    legacyRecipientKey?: RequestRecipientKey | null
    legacyRecipientNumber?: number | null
  }
  ccRecipients?: Array<{
    uid: string
    legacyRecipientKey?: RequestRecipientKey | null
  }>
}

/**
 * إنشاء طلب داخلي:
 * - يولّد sequence خاص بالجهة الأساسية
 * - يبني requestNumber = "<mainRecipientNumber>/<sequence>"
 * - يحدد المسؤول الحالي (Hybrid): currentAssigneeUid + currentAssignee
 * - يحول ccRecipientKeys إلى ccUids (Hybrid)
 */
export async function createInternalRequestWithNumber(
  input: CreateInternalRequestWithNumberInput
) {
  const recipient = input.mainRecipient
  if (!recipient.uid) throw new Error("Missing canonical main recipient UID")

  const legacyRecipient = recipient.legacyRecipientKey
    ? getRecipientByKey(recipient.legacyRecipientKey)
    : undefined
  const recipientKey = legacyRecipient?.key ?? null
  const recipientLabel = legacyRecipient?.label ?? recipient.label
  const recipientNumber = legacyRecipient?.number ?? recipient.legacyRecipientNumber ?? null
  const ccRecipients = Array.isArray(input.ccRecipients) ? input.ccRecipients : []
  const ccUids = Array.from(
    new Set(ccRecipients.map((value) => value.uid).filter((uid) => uid && uid !== recipient.uid))
  )
  const ccKeys = Array.from(
    new Set(
      ccRecipients
        .map((value) => value.legacyRecipientKey)
        .filter((key): key is RequestRecipientKey => Boolean(key && getRecipientByKey(key)))
    )
  )

  // ✅ Hybrid: اعرف الشخص (UID) المرتبط بهذه الجهة
  const assignee = { uid: recipient.uid, role: recipient.role, key: recipientKey }
  if (!assignee?.uid) {
    throw new Error(`لم يتم العثور على مستخدم مرتبط بالجهة: ${recipientKey}`)
  }

  // ✅ Hybrid: حوّل CC keys → CC uids

  const now = new Date()
  const counterKey = recipientKey ?? `uid_${recipient.uid}`
  const counterRef = doc(db, COUNTERS_COLLECTION, counterKey)
  const reqRef = doc(collection(db, COLLECTION_NAME))

  await runTransaction(db, async (tx) => {
    // 1) sequence لكل جهة
    const counterSnap = await tx.get(counterRef)
    const prevSeq = counterSnap.exists()
      ? (counterSnap.data().sequence as number) || 0
      : 0
    const nextSeq = prevSeq + 1

    tx.set(
      counterRef,
      { sequence: nextSeq, updatedAt: serverTimestamp() },
      { merge: true }
    )

    const requestNumber = recipientNumber !== null
      ? `${recipientNumber}/${nextSeq}`
      : `${recipient.uid}/${nextSeq}`

    // 2) بيانات الطلب
    const docData = {
      title: input.title,
      type: input.type,
      description: input.description,

      createdByUid: input.createdByUid,
      createdByEmail: input.createdByEmail ?? null,
      createdByDept: input.createdByDept ?? null,

      createdByRecipientKey: input.createdByRecipientKey ?? null,
      createdByLabel: input.createdByLabel ?? null,

      status: "open" as RequestStatus,

      // الجهة الأساسية + رقم الطلب
      mainRecipientKey: recipientKey,
      mainRecipientLabel: recipientLabel,
      mainRecipientNumber: recipientNumber,
      mainRecipientUid: recipient.uid,
      mainRecipientOrgUnitId: recipient.orgUnitId,
      mainRecipientPositionCode: recipient.positionCode,
      sequenceForRecipient: nextSeq,
      requestNumber,

      // ✅ Hybrid: المسؤول الحالي = شخص الجهة
      currentAssignee: {
        uid: assignee.uid,
        role: assignee.role,
      },
      currentAssigneeUid: assignee.uid,
      currentAssigneeKey: recipientKey,
      currentAssigneeLabel: recipientLabel,

      // ✅ CC (keys + uids)
      ccRecipientKeys: ccKeys,
      ccUids,

      archived: false,
      pdfUrl: null,

      attachments: [],

      actions: [
        {
          at: now,
          fromUid: input.createdByUid,
          fromRole: input.createdByRole,
          toUid: assignee.uid,
          toRole: assignee.role,
          toRecipientKey: recipientKey,
          actionType: "submitted" as RequestActionType,
          comment: "",
        },
      ],

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    tx.set(reqRef, docData)
  })

  return reqRef.id
}

// ===================== Listeners =====================

export function listenMyRequests(
  uid: string,
  cb: (requests: InternalRequest[]) => void
) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("createdByUid", "==", uid),
    orderBy("createdAt", "desc")
  )

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(mapDocToInternalRequest)
      cb(items)
    },
    (err) => {
      // ✅ أثناء logout طبيعي يحصل permission-denied
      if ((err as any)?.code === "permission-denied") return
      console.error("listenMyRequests snapshot error:", err)
    }
  )
}

export function listenAssignedRequestsByRole(
  role: Role,
  cb: (requests: InternalRequest[]) => void
) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("currentAssignee.role", "==", role),
    orderBy("createdAt", "desc")
  )

  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map(mapDocToInternalRequest)
      const active = all.filter((r) => ["open", "in_progress"].includes(r.status))
      cb(active)
    },
    (err) => {
      if ((err as any)?.code === "permission-denied") return
      console.error("listenAssignedRequestsByRole snapshot error:", err)
    }
  )
}

export function listenInternalRequestById(
  id: string,
  cb: (request: InternalRequest | null) => void
) {
  const ref = doc(db, COLLECTION_NAME, id)

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb(null)
        return
      }
      cb(mapDataToInternalRequest(snap.id, snap.data() as any))
    },
    (err) => {
      if ((err as any)?.code === "permission-denied") return
      console.error("listenInternalRequestById snapshot error:", err)
    }
  )
}

// ===================== Actions =====================

export type PerformRequestActionInput = {
  requestId: string
  actionType: RequestActionType
  actorUid: string
  actorRole: Role | null
  comment?: string

  // للإحالة (forwarded) أو تغيير المسؤول
  targetUid?: string | null
  targetRole?: Role | null
  targetRecipientKey?: RequestRecipientKey | null

  // لو عاوز تفرض حالة معيّنة (وإلا هنستنتج حسب نوع الحركة)
  newStatus?: RequestStatus | null
}

/**
 * يضيف Action جديد للطلب + يحدّث الحالة والمسؤول الحالي
 */
// ========= تنفيذ إجراء على الطلب (موافقة / رفض / إحالة / تعليق / إغلاق) =========
export async function performRequestAction(input: PerformRequestActionInput) {
  const ref = doc(db, COLLECTION_NAME, input.requestId)
  const snap = await getDoc(ref)

  if (!snap.exists()) throw new Error("الطلب غير موجود")

  const data = snap.data() as any
  const now = new Date()
  const existingActions: any[] = Array.isArray(data.actions) ? data.actions : []

  // استنتاج الحالة الجديدة
  let status: RequestStatus = (data.status as RequestStatus) ?? "open"

const terminalStatuses: RequestStatus[] = ["approved", "rejected", "closed", "cancelled"];
const shouldArchive = terminalStatuses.includes(status);


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
      default:
        break
    }
  }

  // استنتاج المسؤول الحالي الجديد
  let currentAssignee = data.currentAssignee || { uid: null, role: null }
  let currentAssigneeKey = data.currentAssigneeKey ?? null
  let currentAssigneeLabel = data.currentAssigneeLabel ?? null

  if (input.actionType === "forwarded") {
    currentAssignee = { uid: input.targetUid ?? null, role: input.targetRole ?? null }
    currentAssigneeKey = input.targetRecipientKey ?? null

    const rec = input.targetRecipientKey ? getRecipientByKey(input.targetRecipientKey) : null
    currentAssigneeLabel = rec?.label ?? currentAssigneeLabel
  } else if (["approved", "rejected", "closed"].includes(input.actionType)) {
    currentAssignee = { uid: null, role: null }
    currentAssigneeKey = null
    currentAssigneeLabel = null
  }

  const newAction = {
    at: now,
    fromUid: input.actorUid,
    fromRole: input.actorRole,
    toUid: input.targetUid ?? null,
    toRole: input.targetRole ?? null,
    toRecipientKey: input.targetRecipientKey ?? null,
    actionType: input.actionType,
    comment: input.comment ?? "",
  }

  const updatedActions = [...existingActions, newAction]

  // ✅ تفعيل الأرشيف تلقائياً عند الحالات النهائية
  const terminal: RequestStatus[] = ["approved", "rejected", "closed", "cancelled"]
  const prevArchived = Boolean(data.archived)
  const archived = terminal.includes(status) ? true : prevArchived

  await updateDoc(ref, {
    status,
    currentAssignee,
    currentAssigneeKey,
    currentAssigneeLabel,
    actions: updatedActions,
    updatedAt: serverTimestamp(),
    archived: shouldArchive ? true : (data.archived ?? false),
  })
}

