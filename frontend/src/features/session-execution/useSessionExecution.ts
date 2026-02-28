'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NotFoundError } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import type { SessionExecution } from '@/app/_shared/api/types'
import { getSessionExecution } from './api'

export type ExecState =
  | { status: 'loading' }
  | { status: 'success'; data: SessionExecution }
  | { status: 'error'; notFound: boolean }

const LOADING: ExecState = { status: 'loading' }

export function useSessionExecution(sessionId: string): ExecState {
  const [state, setState] = useState<ExecState>(LOADING)
  const router = useRouter()

  useEffect(() => {
    const controller = new AbortController()
    setState(LOADING)

    getSessionExecution(sessionId)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: 'success', data })
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        try {
          handleApiError(err, router)
        } catch (e) {
          setState({ status: 'error', notFound: e instanceof NotFoundError })
        }
      })

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return state
}
