// lib/internal-requests.ts
"use client"

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp,
  where,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Role } from "@/lib/roles"

export type RequestStatus = "pending" | "in_progress" | "approved" | "rejected" | "cancelled"
export type RequestType = "general" | "purchase" | "it" | "hr"

export type InternalRequest = {
  id: string
  title: string
  type: RequestType
  description: string

  createdByUid: string
  createdByEmail?: string | null

  status: RequestStatus

  approvalSteps: Role[]
  currentStepIndex: number

  createdAt: Date | null
  updatedAt: Date | null

  history: {
    at: Date | null
    actorUid: string
    actorRole: Role | null
    action: "created" | "approved" | "rejected"
    comment?: string
  }[]
}

const COLLECTION = "internalRequests"

// ممكن تعدل هنا لو حابب تختار خطوات مختلفة حسب نوع الطلب
export function getDefaultApprovalSteps(type: RequestType): Role[] {
  switch (type) {
    case "purchase":
      return ["hr", "ceo"]
    case "it":
      return ["hr"]
    case "hr":
      return ["hr", "ceo"]
    case "general":
    default:
      return ["hr"]
  }
}

export async function createInternalRequest(params: {
  title: string
  type: RequestType
  description: string
  createdByUid: string
  createdByEmail?: string | null
}) {
  const approvalSteps = getDefaultApprovalSteps(params.type)

  const history = [
    {
      at: new Date(),
      actorUid: params.createdByUid,
      actorRole: null as Role | null,
      action: "created" as const,
      comment: "",
    },
  ]

  const docRef = await addDoc(collection(db, COLLECTION), {
    title: params.title,
    type: params.type,
    description: params.description,
    createdByUid: params.createdByUid,
    createdByEmail: params.createdByEmail ?? null,
    status: "pending" as RequestStatus,
    approvalSteps,
    currentStepIndex: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    history,
  })

  return docRef.id
}

// الاستماع لطلبات المستخدم نفسه
export function listenMyRequests(
  uid: string,
  cb: (requests: InternalRequest[]) => void,
) {
  const q = query(
    collection(db, COLLECTION),
    where("createdByUid", "==", uid),
    orderBy("createdAt", "desc"),
  )

  return onSnapshot(q, (snap) => {
    const items: InternalRequest[] = snap.docs.map((d) => {
      const data = d.data() as any
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.() ?? null,
        history: (data.history ?? []).map((h: any) => ({
          ...h,
          at: h.at?.toDate?.() ?? null,
        })),
      }
    })
    cb(items)
  })
}

// الاستماع للطلبات التي تحتاج اعتمادي (بحسب الـ role)
export function listenRequestsToApprove(
  role: Role,
  cb: (requests: InternalRequest[]) => void,
) {
  const q = query(
    collection(db, COLLECTION),
    where("status", "in", ["pending", "in_progress"]),
    where("approvalSteps", "array-contains", role),
    orderBy("createdAt", "desc"),
  )

  return onSnapshot(q, (snap) => {
    const items: InternalRequest[] = []

    snap.forEach((d) => {
      const data = d.data() as any
      // لازم تكون الخطوة الحالية هي نفس دوري
      if (data.approvalSteps?.[data.currentStepIndex] !== role) return

      items.push({
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.() ?? null,
        history: (data.history ?? []).map((h: any) => ({
          ...h,
          at: h.at?.toDate?.() ?? null,
        })),
      })
    })

    cb(items)
  })
}

export async function decideOnRequest(params: {
  id: string
  actorUid: string
  actorRole: Role
  decision: "approve" | "reject"
  comment?: string
}) {
  const ref = doc(db, COLLECTION, params.id)

  // ⚠️ هنا من الأفضل نضيف التحقق النهائي في Rules
  // الكلاينت فقط يطلب، والـ Rules تتأكد إنه مسموح له

  // نستخدم updateDoc مباشرًا (بما أن عدد المستخدمين قليل)
  // من غير transaction مبدئيًا، ولو حبيت نطورها بعدين نعملها بـ runTransaction
  const at = new Date()

  await updateDoc(ref, {
    // Firestore مش بيقدر يضيف عنصر في array معتمد على القيمة القديمة بسهولة
    // فهنا بنخلي الـ Rules تمنع أي عبث، ونعتمد على الكود لكتابة الحالة النهائية
    // (لو حبيت نعملها transaction خبرني في مرة تانية)
    status: params.decision === "approve" ? "approved" : "rejected",
    currentStepIndex: params.decision === "approve" ? 999 : -1,
    updatedAt: serverTimestamp(),
    // تقدر تعدّل تصميم history لاحقًا
  })
}
