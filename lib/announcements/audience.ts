import type { Role } from "@/hooks/use-claims-role";
import {
  buildAudienceTokensFromSelection,
  buildAudienceTokensFromUser,
} from "@/lib/audience-tokens";
import { POSITION_LABELS } from "@/lib/internal-requests/creator-label";

export const SCHOOL_OPTIONS = [
  { key: "manar_boys_sayh", label: "منار الريادة بنين - السيح" },
  { key: "manar_boys_faleh", label: "منار الريادة بنين - الفالح" },
  { key: "manar_girls", label: "منار الريادة — بنات" },
  { key: "rawdat_1", label: "روضة واحة الرياحين الأولى" },
  { key: "rawdat_2", label: "روضة واحة الرياحين الثانية" },
  { key: "rawdat_3", label: "روضة واحة الرياحين الثالثة" },
  { key: "rawdat_4", label: "روضة واحة الرياحين الرابعة" },
] as const;

export const UNIT_OPTIONS = [
  { key: "council", label: "مجلس الإدارة" },
  { key: "executive", label: "الإدارة التنفيذية" },
  { key: "supervision", label: "الإشراف التعليمي" },
  { key: "school", label: "المدارس" },
] as const;

export const SCHOOL_TYPE_OPTIONS = [
  { key: "primary", label: "مدارس" },
  { key: "kg", label: "روضات" },
] as const;

export const ROLE_OPTIONS: Role[] = [
  "employee",
  "hr",
  "chairman",
  "ceo",
  "admin",
  "superadmin",
];

export function parseTags(input: string): string[] {
  return input
    .split(/[;,،\n]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function buildAudienceTokens(params: {
  all?: boolean;
  schools?: string[];
  orgUnitIds?: string[];
  units?: string[];
  roles?: string[];
  schoolTypes?: string[];
  tags?: string[];
  positionCodes?: string[];
  personUids?: string[];
  orgUnitPositions?: Array<{ orgUnitId: string; positionCode: string }>;
  schoolTypePositions?: Array<{ schoolType: string; positionCode: string }>;
}) {
  return buildAudienceTokensFromSelection(params);
}

export function buildUserTokens(params: {
  uid?: string | null;
  role?: string | null;
  orgUnitId?: string | null;
  positionCode?: string | null;
  unit?: string | null;
  schoolKey?: string | null;
  schoolType?: string | null;
  tags?: string[];
  employmentStatus?: string | null;
  active?: boolean | null;
  disabled?: boolean | null;
  status?: string | null;
}) {
  return buildAudienceTokensFromUser(params as Record<string, unknown>, params.uid);
}

export function audienceLabel(token: string) {
  if (token === "all:all") return "للجميع";

  if (token.startsWith("person:")) {
    return "شخص محدد";
  }

  if (token.startsWith("orgUnitPosition:")) {
    const [, orgUnitId, positionCode] = token.split(":");
    const orgUnitLabel =
      SCHOOL_OPTIONS.find((x) => x.key === orgUnitId)?.label ?? orgUnitId;
    return `${POSITION_LABELS[positionCode] ?? positionCode} — ${orgUnitLabel}`;
  }

  if (token.startsWith("schoolTypePosition:")) {
    const [, schoolType, positionCode] = token.split(":");
    if (schoolType === "kg" && positionCode === "principal") {
      return "مديرات الروضات";
    }
    if (schoolType === "primary" && positionCode === "principal") {
      return "مديرو المدارس";
    }
    const schoolTypeLabel =
      SCHOOL_TYPE_OPTIONS.find((x) => x.key === schoolType)?.label ?? schoolType;
    return `${POSITION_LABELS[positionCode] ?? positionCode} — ${schoolTypeLabel}`;
  }

  if (token.startsWith("position:")) {
    const key = token.replace("position:", "");
    return POSITION_LABELS[key] ?? key;
  }

  if (token.startsWith("role:")) {
    const key = token.replace("role:", "");
    const map: Record<string, string> = {
      employee: "الموظفون",
      hr: "الموارد البشرية",
      chairman: "رئيس المجلس",
      ceo: "المدير التنفيذي",
      admin: "الإدارة",
      superadmin: "superadmin",
    };
    return map[key] ?? key;
  }

  if (token.startsWith("unit:")) {
    const key = token.replace("unit:", "");
    return (
      UNIT_OPTIONS.find((x) => x.key === key)?.label ??
      key
    );
  }

  if (token.startsWith("schoolKey:")) {
    const key = token.replace("schoolKey:", "");
    return (
      SCHOOL_OPTIONS.find((x) => x.key === key)?.label ??
      key
    );
  }

  if (token.startsWith("orgUnitId:")) {
    const key = token.replace("orgUnitId:", "");
    return SCHOOL_OPTIONS.find((x) => x.key === key)?.label ?? key;
  }

  if (token.startsWith("schoolType:")) {
    const key = token.replace("schoolType:", "");
    return (
      SCHOOL_TYPE_OPTIONS.find((x) => x.key === key)?.label ??
      key
    );
  }

  if (token.startsWith("tag:")) {
    return `وسم: ${token.replace("tag:", "")}`;
  }

  return token;
}
