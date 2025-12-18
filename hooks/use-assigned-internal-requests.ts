// hooks/use-assigned-internal-requests.ts
"use client"

import { useEffect, useState } from "react"
import useClaimsRole from "@/hooks/use-claims-role"
import type { InternalRequest } from "@/lib/internal-requests/types"
import { listenAssignedRequestsByRole } from "@/lib/internal-requests/firestore"
import type { Role } from "@/lib/roles"

type UseAssignedInternalRequestsState = {
  loading: boolean
  requests: InternalRequest[]
}

export function useAssignedInternalRequests(): UseAssignedInternalRequestsState {
  const { role } = useClaimsRole()
  const [state, setState] = useState<UseAssignedInternalRequestsState>({
    loading: true,
    requests: [],
  })

  useEffect(() => {
    if (!role) {
      setState({ loading: false, requests: [] })
      return
    }

    const r = role as Role

    const unsubscribe = listenAssignedRequestsByRole(r, (items) => {
      setState({ loading: false, requests: items })
    })

    return () => unsubscribe()
  }, [role])

  return state
}
