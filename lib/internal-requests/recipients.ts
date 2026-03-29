export const RECIPIENTS = [
  { key: "chairman",            label: "رئيس المجلس",             number: 1,  email: "pres.tk@qz.org.sa" },
  { key: "ceo",                 label: "المدير التنفيذي",         number: 2,  email: "asalfayez@qz.org.sa" },
  { key: "finance",             label: "المالية",                 number: 3,  email: "a.alhrbi@qz.org.sa" },
  { key: "projects",            label: "المشاريع",                number: 4,  email: "aldawish@qz.org.sa" },
  { key: "maintenance",         label: "الصيانة",                 number: 5,  email: "a.almunifi@qz.org.sa" },
  { key: "hr",                  label: "الموارد البشرية",         number: 6,  email: "kh.alamer@qz.org.sa" },
  { key: "platforms",           label: "المنصات",                 number: 7,  email: "aa.alshaya@qz.org.sa" },
  { key: "collector",           label: "المحصل المالي",           number: 8,  email: "n.alamer@qz.org.sa" },
  { key: "secretary",           label: "السكرتارية",              number: 9,  email: "e.ahmad@qz.org.sa" },
  { key: "media_manager",       label: "مدير الإعلام",            number: 10, email: "m.albahr@qz.org.sa" },
  { key: "designer",            label: "المصممة",                 number: 11, email: "a.aljasir@qz.org.sa" },
  { key: "supervision_head",    label: "رئيس قسم الإشراف",        number: 12, email: "h-alnasser@qz.org.sa" },
  { key: "executive_assistant", label: "مساعدة المدير التنفيذي",  number: 13, email: "h.alshaya@qz.org.sa" },
  { key: "admin_supervisor",    label: "المشرفة الإدارية",        number: 14, email: "a-almansur@qz.org.sa" },
  { key: "edu_supervisor",      label: "المشرفة التعليمية",       number: 15, email: "f-alhamaad@qz.org.sa" },
  { key: "athar_center",        label: "مركز أثر",                number: 16, email: "bader-a-albader@qz.org.sa" },
  { key: "binaa_center_boys",   label: "مركز بناء بنين",          number: 17, email: "aa.alhumidi@qz.org.sa" },
  { key: "binaa_center_girls",  label: "مركز بناء بنات",          number: 18, email: "t.alamer@qz.org.sa" },
  { key: "mnar_boys_ceo",       label: "مدير منار الريادة بنين",  number: 19, email: "a-s-alkmays@qz.org.sa" },
  { key: "mnar_girls_ceo",      label: "مديرة منار الريادة بنات", number: 20, email: "n.albader@qz.org.sa" },
  { key: "rawda1_ceo",          label: "مديرة الروضة الأولى",     number: 21, email: "a.alhomidi@qz.org.sa" },
  { key: "rawda2_ceo",          label: "مديرة الروضة الثانية",    number: 22, email: "s.alturiqe@qz.org.sa" },
  { key: "rawda3_ceo",          label: "مديرة الروضة الثالثة",    number: 23, email: "s.alnafea@qz.org.sa" },
  { key: "rawda4_ceo",          label: "مديرة الروضة الرابعة",    number: 24, email: "n.alhamiyn@qz.org.sa" },
  { key: "media_programs",      label: "البرامج المصورة",         number: 25, email: "m.alfrraj@qz.org.sa" },
] as const;

export type RequestRecipient = (typeof RECIPIENTS)[number];
export type RequestRecipientKey = RequestRecipient["key"];

const RECIPIENTS_BY_KEY = new Map<string, RequestRecipient>(
  RECIPIENTS.map((r) => [r.key, r])
);

function normalizeEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase();
}

const RECIPIENTS_BY_EMAIL = new Map<string, RequestRecipient>(
  RECIPIENTS.map((r) => [normalizeEmail(r.email), r])
);

export function isRecipientKey(value: string): value is RequestRecipientKey {
  return RECIPIENTS_BY_KEY.has(value);
}

export function getRecipientByKey(key?: string | null) {
  if (!key) return undefined;
  return RECIPIENTS_BY_KEY.get(key);
}

export function getRecipientByEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  return RECIPIENTS_BY_EMAIL.get(normalized);
}