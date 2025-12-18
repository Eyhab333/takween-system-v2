// lib/internal-requests/types.ts
import type { Role } from "@/lib/roles"

// حالة الطلب الرئيسية
export type RequestStatus =
  | "open"        // تم إنشاؤه ومفتوح
  | "in_progress" // تحت الإجراء / الإحالات
  | "approved"    // تم اعتماده نهائيًا
  | "rejected"    // تم رفضه
  | "closed"      // تم إغلاقه بعد التنفيذ
  | "cancelled"   // تم إلغاؤه من مقدم الطلب

// نوع الحركة على الطلب (في سجل الإحالات / التايم لاين)
export type RequestActionType =
  | "submitted"     // أول إنشاء للطلب
  | "forwarded"     // إحالة من شخص لآخر
  | "approved"      // موافقة
  | "rejected"      // رفض
  | "comment"       // تعليق فقط
  | "closed"        // إغلاق الطلب
  | "generated_pdf" // تم توليد ملف PDF

// نوع الطلب (ممكن نزود لاحقًا)
export type RequestType =
  | "general"   // عام
  | "finance"   // مالية
  | "hr"        // موارد بشرية
  | "projects"  // مشاريع
  | "it"        // تقني

// خطوة / حركة واحدة في سجل الطلب
export interface RequestAction {
  id?: string // اختياري لو حبيت تدي لكل حركة ID
  at: Date | null
  fromUid: string | null
  fromRole: Role | null
  toUid: string | null
  toRole: Role | null
  actionType: RequestActionType
  comment: string
}

// الكيان الأساسي للطلب
export interface InternalRequest {
  id: string
  title: string
  type: RequestType
  description: string

  createdByUid: string
  createdByEmail?: string | null
  createdByDept?: string | null

  status: RequestStatus

  currentAssignee: {
    uid: string | null
    role: Role | null
  }

  createdAt: Date | null
  updatedAt: Date | null

  archived: boolean
  pdfUrl?: string | null

  actions: RequestAction[]
}
