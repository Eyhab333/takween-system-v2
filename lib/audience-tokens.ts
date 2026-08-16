// export function normalizeAudienceTokens(value: unknown): string[] {
//   if (!Array.isArray(value)) return [];

//   return Array.from(
//     new Set(
//       value
//         .filter((token): token is string => typeof token === "string")
//         .map((token) => token.trim())
//         .filter(Boolean),
//     ),
//   );
// }

// export function documentAudienceTokens(data: Record<string, unknown>): string[] {
//   const tokens = normalizeAudienceTokens(data.audTokens);
//   return tokens.length > 0 ? tokens : ["all:all"];
// }

// export function buildAudienceTokensFromUser(data: Record<string, unknown>): string[] {
//   const tokens = ["all:all"];
//   const unit = typeof data.unit === "string" ? data.unit.trim() : "";
//   const schoolKey = typeof data.schoolKey === "string" ? data.schoolKey.trim() : "";
//   const schoolType = typeof data.schoolType === "string" ? data.schoolType.trim() : "";

//   if (unit) tokens.push(`unit:${unit}`);
//   if (schoolKey) tokens.push(`schoolKey:${schoolKey}`);
//   if (schoolType) tokens.push(`schoolType:${schoolType}`);
//   if (Array.isArray(data.tags)) {
//     for (const tag of data.tags) {
//       if (typeof tag === "string" && tag.trim()) tokens.push(`tag:${tag.trim()}`);
//     }
//   }

//   return Array.from(new Set(tokens));
// }

// export function audienceMatchesUser(
//   documentTokens: string[],
//   userTokens: string[],
// ): boolean {
//   const userTokenSet = new Set(userTokens);
//   return documentTokens.some((token) => userTokenSet.has(token));
// }

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

export function documentAudienceTokens(
  data: Record<string, unknown>,
): string[] {
  const tokens = normalizeAudienceTokens(data.audTokens);

  return tokens.length > 0
    ? tokens
    : ["all:all"];
}

export function buildAudienceTokensFromUser(
  data: Record<string, unknown>,
): string[] {
  const tokens = ["all:all"];

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

  const schoolType =
    typeof data.schoolType === "string"
      ? data.schoolType.trim()
      : "";

  if (role) {
    tokens.push(`role:${role}`);
  }

  if (unit) {
    tokens.push(`unit:${unit}`);
  }

  if (schoolKey) {
    tokens.push(`schoolKey:${schoolKey}`);
  }

  if (schoolType) {
    tokens.push(`schoolType:${schoolType}`);
  }

  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      if (
        typeof tag === "string" &&
        tag.trim()
      ) {
        tokens.push(`tag:${tag.trim()}`);
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
