'use client'

/**
 * Shared auth context — fetches /v1/me once per authenticated session and
 * exposes the result to the whole app via React context.
 *
 * Mount <AuthProvider> inside <RequireAuth> in the (app) layout so that
 * Supabase session is already confirmed before this fetch runs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { MeResponse } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  me: MeResponse | null
  role: 'COACH' | 'ATHLETE' | null
  activeTeamId: string | null
  loading: boolean
  error: Error | null
  refreshMe: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRole(me: MeResponse): 'COACH' | 'ATHLETE' | null {
  const membership = me.active_team_id
    ? me.memberships.find((m) => m.team_id === me.active_team_id)
    : (me.memberships[0] ?? null)
  const role = membership?.role
  if (role === 'COACH' || role === 'ATHLETE') return role
  return null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  me: null,
  role: null,
  activeTeamId: null,
  loading: true,
  error: null,
  refreshMe: () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Incrementing this triggers the fetch effect.
  const [refreshToken, setRefreshToken] = useState(0)

  const refreshMe = useCallback(() => setRefreshToken((t) => t + 1), [])

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    request<MeResponse>('/v1/me', { signal: controller.signal })
      .then((data) => {
        setMe(data)
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err : new Error('Failed to load profile'))
        setLoading(false)
      })

    return () => controller.abort()
  }, [refreshToken])

  const role = me ? deriveRole(me) : null

  const value: AuthContextValue = {
    me,
    role,
    activeTeamId: me?.active_team_id ?? null,
    loading,
    error,
    refreshMe,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the full auth context value. */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
