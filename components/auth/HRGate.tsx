/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import useClaimsRole from "@/hooks/use-claims-role" // نفس الهوك اللي بنقرأ منه الدور

const HR_ROLES = ["hr","chairman","ceo","admin","superadmin"] as const

export default function HRGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { role, loading, uid } = useClaimsRole()

  useEffect(() => {
    if (loading) return
    const isHrOrAbove = role && HR_ROLES.includes(role as any)
    if (!isHrOrAbove) {
      // لو مش HR+: ودّيه لصفحة ملفه الشخصي
      if (uid) router.replace(`/employees/${uid}`)
      else router.replace("/login")
    }
  }, [loading, role, uid, router])

  if (loading) return null
  return <>{children}</>
}
