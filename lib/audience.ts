export function buildUserTokens(user: {
  unit?: string | null
  schoolKey?: string | null
  schoolType?: string | null
  tags?: string[] | null
}) {
  const tokens: string[] = []

  // للجميع
  tokens.push("all:all")

  if (user.unit) tokens.push(`unit:${user.unit}`)
  if (user.schoolKey) tokens.push(`schoolKey:${user.schoolKey}`)
  if (user.schoolType) tokens.push(`schoolType:${user.schoolType}`)
  if (Array.isArray(user.tags)) {
    for (const t of user.tags) {
      if (t && typeof t === "string") tokens.push(`tag:${t}`)
    }
  }

  // إزالة التكرار
  return Array.from(new Set(tokens))
}
