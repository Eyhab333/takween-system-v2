/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import useClaimsRole from "@/hooks/use-claims-role"
import AppShell from "@/components/layout/AppShell"

const HR_ROLES = ["hr","chairman","ceo","admin","superadmin"] as const

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { role, uid, loading } = useClaimsRole()

  useEffect(() => {
    if (loading) return
    const isHrOrAbove = role && HR_ROLES.includes(role as any)
    if (!isHrOrAbove) {
      if (uid) router.replace(`/employees/${uid}`)   // 👈 الموظف العادي → بروفايله
      else router.replace("/login")
    }
  }, [loading, role, uid, router])

  if (loading) return null

  // لو HR+ فقط نوصل للـ Shell
  return <AppShell>{children}</AppShell>
}
