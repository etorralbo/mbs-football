import { useEffect, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { FunnelResponse } from '@/app/_shared/api/types'

type FunnelState =
  | { status: 'loading' }
  | { status: 'success'; data: FunnelResponse }
  | { status: 'error' }

const LOADING: FunnelState = { status: 'loading' }

export function useFunnelStats(enabled: boolean): FunnelState {
  const [state, setState] = useState<FunnelState>(LOADING)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(LOADING)

    request<FunnelResponse>('/v1/analytics/funnel')
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
