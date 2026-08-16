// hooks/useClaimsRole.ts
"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase"

export function useClaimsRole() {
  const [uid, setUid] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = auth.onIdTokenChanged(async (u) => {
      if (!u) {
        setUid(null)
        setEmail(null)
        setRole(null)
        setLoading(false)
        return
      }
      // نجبر تحديث التوكن عشان يظهر فيه الـ custom claims الجديدة بعد الاستيراد
      const res = await u.getIdTokenResult(true)
      setUid(u.uid)
      setEmail(u.email)
      setRole((res.claims?.role as string) || null)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { uid, email, role, loading }
}
