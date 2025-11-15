// hooks/useClaimsRole.ts
"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase"

export function useClaimsRole() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = auth.onIdTokenChanged(async (u) => {
      if (!u) {
        setRole(null)
        setLoading(false)
        return
      }
      // نجبر تحديث التوكن عشان يظهر فيه الـ custom claims الجديدة بعد الاستيراد
      const res = await u.getIdTokenResult(true)
      setRole((res.claims?.role as string) || null)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { role, loading }
}
