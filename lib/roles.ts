export type Role = "employee" | "hr" | "chairman" | "ceo" | "admin" | "superadmin"

export const ROLE_ORDER: Role[] = ["employee","hr","chairman","ceo","admin","superadmin"]

export function hasRoleAtLeast(userRole: Role | null | undefined, min: Role) {
  if (!userRole) return false
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(min)
}