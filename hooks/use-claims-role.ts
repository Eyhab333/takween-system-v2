"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase"

export type Role = "employee" | "hr" | "chairman" | "ceo" | "admin" | "superadmin"

type ClaimsState = {
  loading: boolean
  uid: string | null
  email: string | null
  role: Role | null
}

export default function useClaimsRole(): ClaimsState {
  const [state, setState] = useState<ClaimsState>({
    loading: true,
    uid: null,
    email: null,
    role: null,
  })

  useEffect(() => {
    // راقب تغيّر حالة المستخدم
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setState({ loading: false, uid: null, email: null, role: null })
        return
      }

      try {
        // اجبر تحديث التوكن عشان نقرأ الclaims الأحدث
        const token = await u.getIdTokenResult(true)
        const role = (token.claims?.role as Role | undefined) ?? null
        setState({ loading: false, uid: u.uid, email: u.email ?? null, role })
      } catch {
        // لو فشل التحديث نرجّع أقل معلومات
        setState({ loading: false, uid: u.uid, email: u.email ?? null, role: null })
      }
    })
    return () => unsub()
  }, [])

  return state
}
