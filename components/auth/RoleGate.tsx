// components/auth/RoleGate.tsx
"use client"

import { ReactNode, useMemo } from "react"
import { useClaimsRole } from "@/hooks/useClaimsRole"

type Role = "employee" | "hr" | "chairman" | "ceo" | "admin" | "superadmin"

const rolePriority: Record<Role, number> = {
  employee: 1,
  hr: 2,
  chairman: 3,
  ceo: 4,
  admin: 5,
  superadmin: 6,
}

function hasRoleAtLeast(userRole: string | null, min: Role) {
  if (!userRole) return false
  // لو جالك role خارج القائمة هنعامله كـ employee
  const safe = (userRole in rolePriority ? (userRole as Role) : "employee")
  return rolePriority[safe] >= rolePriority[min]
}

export default function RoleGate({
  min,
  fallback = null,
  children,
}: {
  min: Role
  fallback?: ReactNode
  children: ReactNode
}) {
  const { role, loading } = useClaimsRole()

  const allowed = useMemo(() => {
    if (loading) return false
    return hasRoleAtLeast(role, min)
  }, [loading, role, min])

  if (loading) {
    // شاشة انتظار بسيطة أثناء تحميل الـ claims
    return <div className="text-sm text-muted-foreground">جارٍ التحقق من الصلاحيات…</div>
  }

  if (!allowed) {
    return <>{fallback}</> // ممكن تمرّر نص/زر/تلميح بديل
  }

  return <>{children}</>
}
