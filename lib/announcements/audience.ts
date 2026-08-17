import type { Role } from "@/hooks/use-claims-role";

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
}) {
  const tokens: string[] = [];

  if (params.all) {
    tokens.push("all:all");
  }

  for (const school of params.schools ?? []) {
    tokens.push(`schoolKey:${school}`);
  }

  for (const orgUnitId of params.orgUnitIds ?? []) {
    tokens.push(`orgUnitId:${orgUnitId}`);
  }

  for (const unit of params.units ?? []) {
    tokens.push(`unit:${unit}`);
  }

  for (const role of params.roles ?? []) {
    tokens.push(`role:${role}`);
  }

  for (const schoolType of params.schoolTypes ?? []) {
    tokens.push(`schoolType:${schoolType}`);
  }

  for (const tag of params.tags ?? []) {
    tokens.push(`tag:${tag}`);
  }

  return Array.from(new Set(tokens));
}

export function buildUserTokens(params: {
  role?: Role | null;
  unit?: string | null;
  schoolKey?: string | null;
  schoolType?: string | null;
  tags?: string[];
}) {
  const tokens: string[] = ["all:all"];

  if (params.role) {
    tokens.push(`role:${params.role}`);
  }

  if (params.unit) {
    tokens.push(`unit:${params.unit}`);
  }

  if (params.schoolKey) {
    tokens.push(`schoolKey:${params.schoolKey}`);
  }

  if (params.schoolType) {
    tokens.push(`schoolType:${params.schoolType}`);
  }

  for (const tag of params.tags ?? []) {
    if (tag?.trim()) {
      tokens.push(`tag:${tag.trim()}`);
    }
  }

  return Array.from(new Set(tokens));
}

export function audienceLabel(token: string) {
  if (token === "all:all") return "للجميع";

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
