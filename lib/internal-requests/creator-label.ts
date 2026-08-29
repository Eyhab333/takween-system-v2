export const POSITION_LABELS: Record<string, string> = {
  teacher: "معلم", administrative_staff: "إداري", principal: "مدير", deputy_principal: "وكيل",
  supervisor: "مشرف", educational_supervisor: "مشرف تعليمي", administrative_supervisor: "مشرف إداري",
  supervision_head: "رئيس الإشراف", supervision_coordinator: "منسق الإشراف", hr: "الموارد البشرية",
  finance: "المالية", ceo: "الرئيس التنفيذي", chairman: "رئيس مجلس الإدارة", council_member: "عضو مجلس الإدارة",
  executive_assistant: "مساعد تنفيذي", trainee: "متدرب", early_childhood_caregiver: "مربية أطفال",
  student_support: "دعم طلابي", students_mentor: "موجه طلابي", school_monitor: "مراقب مدرسة",
  activity_lead: "رائد نشاط", media_specialist: "إعلامي", designer: "مصمم", collector: "محصل",
  secretary: "سكرتير", platforms_specialist: "المنصات", projects: "المشاريع", maintenance: "الصيانة",
  media_manager: "مدير الإعلام", athar_center_manager: "مدير مركز أثر", support_services: "الخدمات المساندة",
  center_manager: "مدير مركز",
};

export function formatCreatorDisplayLabel(user: {
  positionCode?: unknown;
  position?: unknown;
  name?: unknown;
}) {
  const positionCode = typeof user.positionCode === "string" ? user.positionCode.trim() : "";
  const position = typeof user.position === "string" ? user.position.trim() : "";
  const name = typeof user.name === "string" ? user.name.trim() : "";
  const positionLabel = POSITION_LABELS[positionCode] ?? position;

  if (positionLabel && name) return `${positionLabel} — ${name}`;
  return name || null;
}
