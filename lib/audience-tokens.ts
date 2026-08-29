export function normalizeAudienceTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((token): token is string => typeof token === "string")
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

export const audienceToken = {
  all: () => "all:all",
  schoolKey: (value: string) => `schoolKey:${value}`,
  orgUnitId: (value: string) => `orgUnitId:${value}`,
  unit: (value: string) => `unit:${value}`,
  role: (value: string) => `role:${value}`,
  schoolType: (value: string) => `schoolType:${value}`,
  tag: (value: string) => `tag:${value}`,
  position: (value: string) => `position:${value}`,
  person: (uid: string) => `person:${uid}`,
  orgUnitPosition: (orgUnitId: string, positionCode: string) =>
    `orgUnitPosition:${orgUnitId}:${positionCode}`,
  schoolTypePosition: (schoolType: string, positionCode: string) =>
    `schoolTypePosition:${schoolType}:${positionCode}`,
};

export function buildAudienceTokensFromSelection(params: {
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
}): string[] {
  const tokens: string[] = [];

  if (params.all) return [audienceToken.all()];
  for (const school of params.schools ?? []) tokens.push(audienceToken.schoolKey(school));
  for (const orgUnitId of params.orgUnitIds ?? []) tokens.push(audienceToken.orgUnitId(orgUnitId));
  for (const unit of params.units ?? []) tokens.push(audienceToken.unit(unit));
  for (const role of params.roles ?? []) tokens.push(audienceToken.role(role));
  for (const schoolType of params.schoolTypes ?? []) tokens.push(audienceToken.schoolType(schoolType));
  for (const tag of params.tags ?? []) tokens.push(audienceToken.tag(tag));
  for (const positionCode of params.positionCodes ?? []) tokens.push(audienceToken.position(positionCode));
  for (const uid of params.personUids ?? []) tokens.push(audienceToken.person(uid));
  for (const target of params.orgUnitPositions ?? []) {
    tokens.push(audienceToken.orgUnitPosition(target.orgUnitId, target.positionCode));
  }
  for (const target of params.schoolTypePositions ?? []) {
    tokens.push(audienceToken.schoolTypePosition(target.schoolType, target.positionCode));
  }

  return normalizeAudienceTokens(tokens);
}

export function documentAudienceTokens(
  data: Record<string, unknown>,
): string[] {
  const tokens = normalizeAudienceTokens(data.audTokens);

  return tokens.length > 0
    ? tokens
    : ["all:all"];
}

export function isActiveAudienceUser(data: Record<string, unknown>): boolean {
  return (
    data.employmentStatus !== "inactive" &&
    data.active !== false &&
    data.disabled !== true &&
    data.status !== "inactive"
  );
}

export function buildAudienceTokensFromUser(
  data: Record<string, unknown>,
  uid?: string | null,
): string[] {
  const tokens = [audienceToken.all()];

  // "all:all" remains available to every existing user. More precise staff
  // audiences resolve active employees only, matching fanout resolution.
  if (!isActiveAudienceUser(data)) {
    return tokens;
  }

  const role =
    typeof data.role === "string"
      ? data.role.trim()
      : "";

  const unit =
    typeof data.unit === "string"
      ? data.unit.trim()
      : "";

  const schoolKey =
    typeof data.schoolKey === "string"
      ? data.schoolKey.trim()
      : "";

  const orgUnitId =
    typeof data.orgUnitId === "string"
      ? data.orgUnitId.trim()
      : "";

  const schoolType =
    typeof data.schoolType === "string"
      ? data.schoolType.trim()
      : "";

  const positionCode =
    typeof data.positionCode === "string"
      ? data.positionCode.trim()
      : "";

  if (role) {
    tokens.push(audienceToken.role(role));
  }

  if (unit) {
    tokens.push(audienceToken.unit(unit));
  }

  if (schoolKey) {
    tokens.push(audienceToken.schoolKey(schoolKey));
  }

  if (orgUnitId) {
    tokens.push(audienceToken.orgUnitId(orgUnitId));
  }

  if (orgUnitId === "manar_boys_sayh" || orgUnitId === "manar_boys_faleh") {
    tokens.push(audienceToken.schoolKey("manar_boys"));
  }

  if (schoolType) {
    tokens.push(audienceToken.schoolType(schoolType));
  }

  if (positionCode) {
    tokens.push(audienceToken.position(positionCode));
  }

  if (orgUnitId && positionCode) {
    tokens.push(audienceToken.orgUnitPosition(orgUnitId, positionCode));
  }

  if (schoolType && positionCode) {
    tokens.push(audienceToken.schoolTypePosition(schoolType, positionCode));
  }

  if (uid?.trim()) {
    tokens.push(audienceToken.person(uid.trim()));
  }

  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      if (
        typeof tag === "string" &&
        tag.trim()
      ) {
        tokens.push(audienceToken.tag(tag.trim()));
      }
    }
  }

  return Array.from(new Set(tokens));
}

export function audienceMatchesUser(
  documentTokens: string[],
  userTokens: string[],
): boolean {
  const userTokenSet =
    new Set(userTokens);

  return documentTokens.some((token) =>
    userTokenSet.has(token),
  );
}
