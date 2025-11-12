"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged, User, signOut } from "firebase/auth"

type AuthCtx = { user: User | null; loading: boolean; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>({ user: null, loading: true, logout: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false) })
    return () => unsub()
  }, [])

  return <Ctx.Provider value={{ user, loading, logout: () => signOut(auth) }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
