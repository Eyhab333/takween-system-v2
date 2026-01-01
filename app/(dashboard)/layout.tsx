/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import useClaimsRole from "@/hooks/use-claims-role"
import AppShell from "@/components/layout/AppShell"

const HR_ROLES = ["hr","chairman","ceo","admin","superadmin", "employee"] as const

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { role, uid, loading } = useClaimsRole()

  useEffect(() => {
    if (loading) return

    const isHrOrAbove = role && HR_ROLES.includes(role as any)

    // ✅ صفحات الطلبات متاحة للجميع
    const isRequestsPath = pathname?.startsWith("/requests")

    if (!isRequestsPath && !isHrOrAbove) {
      if (uid) router.replace(`/employees/${uid}`)   // الموظف العادي → بروفايله
      else router.replace("/login")
    }
  }, [loading, role, uid, router, pathname])

  if (loading) return null

  return <AppShell>{children}</AppShell>
}
