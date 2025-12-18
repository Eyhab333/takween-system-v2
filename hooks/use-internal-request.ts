// hooks/use-internal-request.ts
"use client"

import { useEffect, useState } from "react"
import { listenInternalRequestById } from "@/lib/internal-requests/firestore"
import type { InternalRequest } from "@/lib/internal-requests/types"

type UseInternalRequestState = {
  loading: boolean
  request: InternalRequest | null
}

export function useInternalRequest(id: string): UseInternalRequestState {
  const [state, setState] = useState<UseInternalRequestState>({
    loading: true,
    request: null,
  })

  useEffect(() => {
    if (!id) {
      setState({ loading: false, request: null })
      return
    }

    const unsubscribe = listenInternalRequestById(id, (req) => {
      setState({ loading: false, request: req })
    })

    return () => unsubscribe()
  }, [id])

  return state
}
