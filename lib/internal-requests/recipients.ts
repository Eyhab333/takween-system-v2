// lib/internal-requests/recipients.ts
import type { Role } from "@/lib/roles"

export type InternalRecipientId =
  | "chairman"
  | "ceo"
  | "finance"
  | "projects"
  | "maintenance"
  | "hr"
  | "platforms"
  | "collector"
  | "secretary"
  | "media_manager"
  | "designer"
  | "supervision_head"
  | "ceo_assistant"
  | "admin_supervisor"
  | "edu_supervisor"
  | "athar_center"
  | "binaa_center"


export type InternalRecipient = {
  id: InternalRecipientId
  label: string         // اللي يظهر في الـ Select
  email: string
  defaultRole: Role     // لو ما لقيناش role في Firestore
}

export const INTERNAL_RECIPIENTS: InternalRecipient[] = [
  {
    id: "chairman",
    label: "رئيس المجلس",
    email: "pres.tk@qz.org.sa",
    defaultRole: "chairman",
  },
  {
    id: "ceo",
    label: "المدير التنفيذي",
    email: "asalfayez@qz.org.sa",
    defaultRole: "ceo",
  },
  {
    id: "finance",
    label: "المالية",
    email: "a.alhrbi@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "projects",
    label: "المشاريع",
    email: "aldawish@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "maintenance",
    label: "الصيانة",
    email: "a.almunifi@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "hr",
    label: "الموارد البشرية",
    email: "kh.alamer@qz.org.sa",
    defaultRole: "hr",
  },
  {
    id: "platforms",
    label: "المنصات",
    email: "aa.alshaya@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "collector",
    label: "المحصل المالي",
    email: "n.alamer@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "secretary",
    label: "السكرتارية",
    email: "e.ahmad@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "media_manager",
    label: "مدير الإعلام",
    email: "m.albahr@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "designer",
    label: "المصممة",
    email: "a.aljasir@qz.org.sa",
    defaultRole: "employee",
  },
  {
    id: "supervision_head",
    label: "رئيس قسم الإشراف",
    email: "h-alnasser@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "ceo_assistant",
    label: "مساعدة المدير التنفيذي",
    email: "h.alshaya@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "admin_supervisor",
    label: "المشرفة الإدارية",
    email: "a-almansur@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "edu_supervisor",
    label: "المشرفة التعليمية",
    email: "f-alhamaad@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "athar_center",
    label: "مركز أثر",
    email: "bader-a-albader@qz.org.sa",
    defaultRole: "admin",
  },
  {
    id: "binaa_center",
    label: "مركز بناء ",
    email: "aa.alhumidi@qz.org.sa",
    defaultRole: "admin",
  },
]
