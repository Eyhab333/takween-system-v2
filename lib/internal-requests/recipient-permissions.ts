import { RECIPIENTS, type RequestRecipientKey } from "./recipients";

const ALL_KEYS = RECIPIENTS.map((r) => r.key) as RequestRecipientKey[];

const SCHOOL_HEADS: RequestRecipientKey[] = [
  "mnar_girls_ceo",
  "rawda1_ceo",
  "rawda2_ceo",
  "rawda3_ceo",
  "rawda4_ceo",
];

const PERMISSIONS: Record<RequestRecipientKey, RequestRecipientKey[]> = {
  chairman: ALL_KEYS.filter((k) => k !== "chairman"),

  // المدير التنفيذي يرى الجميع بما فيهم رئيس المجلس، ما عدا نفسه
  ceo: ALL_KEYS.filter((k) => k !== "ceo"),

  finance: ["ceo"],
  hr: ["ceo"],
  platforms: ["ceo"],
  collector: ["ceo"],
  secretary: ["ceo"],

  projects: ["ceo", "maintenance"],
  maintenance: ["projects"],

  media_manager: ["ceo", "designer", "media_programs"],
  designer: ["media_manager"],
  media_programs: ["media_manager"],

  supervision_head: ["ceo", "mnar_boys_ceo"],
  mnar_boys_ceo: ["supervision_head"],

  executive_assistant: ["ceo", ...SCHOOL_HEADS],
  admin_supervisor: ["ceo", ...SCHOOL_HEADS],
  edu_supervisor: ["ceo", ...SCHOOL_HEADS],

  mnar_girls_ceo: ["executive_assistant", "admin_supervisor", "edu_supervisor"],
  rawda1_ceo: ["executive_assistant", "admin_supervisor", "edu_supervisor"],
  rawda2_ceo: ["executive_assistant", "admin_supervisor", "edu_supervisor"],
  rawda3_ceo: ["executive_assistant", "admin_supervisor", "edu_supervisor"],
  rawda4_ceo: ["executive_assistant", "admin_supervisor", "edu_supervisor"],

  athar_center: ["ceo"],

  binaa_center_boys: ["ceo", "binaa_center_girls"],
  binaa_center_girls: ["binaa_center_boys"],
};

export function getAllowedRecipientKeys(
  senderKey: RequestRecipientKey | null | undefined
): RequestRecipientKey[] {
  // الموظف العادي الذي لا يملك requestRecipientKey
  // يظل بإمكانه الإرسال للجميع ما عدا رئيس المجلس
  if (!senderKey) {
    return ALL_KEYS.filter((k) => k !== "chairman");
  }

  return PERMISSIONS[senderKey] ?? [];
}

export function canSendTo(
  senderKey: RequestRecipientKey | null | undefined,
  targetKey: RequestRecipientKey | null | undefined
) {
  if (!targetKey) return false;
  return getAllowedRecipientKeys(senderKey).includes(targetKey);
}

export function getVisibleRecipientsForSender(
  senderKey: RequestRecipientKey | null | undefined,
  exclude: Array<RequestRecipientKey | string | null | undefined> = []
) {
  const allowed = new Set(getAllowedRecipientKeys(senderKey));
  const excluded = new Set(exclude.filter(Boolean));

  return RECIPIENTS.filter((r) => allowed.has(r.key) && !excluded.has(r.key));
}