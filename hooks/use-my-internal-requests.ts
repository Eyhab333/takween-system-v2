// hooks/use-my-internal-requests.ts
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import type { InternalRequest } from "@/lib/internal-requests/types"
import { listenMyRequests } from "@/lib/internal-requests/firestore"

type UseMyInternalRequestsState = {
  loading: boolean
  requests: InternalRequest[]
}

export function useMyInternalRequests(): UseMyInternalRequestsState {
  const { user } = useAuth()
  const [state, setState] = useState<UseMyInternalRequestsState>({
    loading: true,
    requests: [],
  })

  useEffect(() => {
    if (!user) {
      setState({ loading: false, requests: [] })
      return
    }

    const unsubscribe = listenMyRequests(user.uid, (items) => {
      setState({ loading: false, requests: items })
    })

    return () => unsubscribe()
  }, [user])

  return state
}
