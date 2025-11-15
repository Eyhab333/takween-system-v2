/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase"

export default function WhoAmI() {
  const [info, setInfo] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const u = auth.currentUser
      if (!u) { setInfo({ error: "not signed in" }); return }
      const token = await u.getIdTokenResult(true) // force refresh
      setInfo({
        email: u.email,
        uid: u.uid,
        claims: token.claims,   // هنا هنشوف role لو موجود
      })
      console.log("whoami:", { email: u.email, uid: u.uid, claims: token.claims })
    })()
  }, [])

  return (
    <pre dir="ltr" style={{padding:20, whiteSpace:"pre-wrap"}}>
      {JSON.stringify(info, null, 2)}
    </pre>
  )
}
