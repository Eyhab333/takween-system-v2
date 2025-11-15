"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/firebase"

export default function MeRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    const u = auth.currentUser
    if (u?.uid) router.replace(`/employees/${u.uid}`)
    else router.replace("/login")
  }, [router])
  return null
}
