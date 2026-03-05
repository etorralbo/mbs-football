'use client'

/**
 * Shared auth context — fetches /v1/me once per authenticated session and
 * exposes the result to the whole app via React context.
 *
 * Mount <AuthProvider> inside <RequireAuth> in the (app) layout so that
 * Supabase session is already confirmed before this fetch runs.
 *
 * Multi-team support:
 * - When me.active_team_id is null (coach with >1 team), the resolved team
 *   comes from localStorage, validated against me.memberships.
 * - setActiveTeamId() / clearActiveTeam() let the Team Picker update the
 *   selection and persist it cross-session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { MeResponse } from '@/app/_shared/api/types'
import {
  _setActiveTeamIdInternal,
  isValidUuid,
} from '@/src/shared/auth/activeTeamStore'

const LOCAL_STORAGE_KEY = 'activeTeamId'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  me: MeResponse | null
  role: 'COACH' | 'ATHLETE' | null
  activeTeamId: string | null
  loading: boolean
  error: Error | null
  /** True while /v1/me is loading OR onboarding logic is resolving. */
  isAppBootstrapping: boolean
  refreshMe: () => Promise<MeResponse>
  setActiveTeamId: (teamId: string) => void
  clearActiveTeam: () => void
  /** Called by router-guard pages (OnboardingHub, AuthContinue) to signal
   *  that post-login resolution is still in progress. */
  setOnboardingResolving: (v: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRole(
  me: MeResponse,
  resolvedTeamId: string | null,
): 'COACH' | 'ATHLETE' | null {
  const teamId = resolvedTeamId ?? me.active_team_id
  const membership = teamId
    ? me.memberships.find((m) => m.team_id === teamId)
    : (me.memberships[0] ?? null)
  const role = membership?.role
  if (role === 'COACH' || role === 'ATHLETE') return role
  return null
}

function safeGetLocalTeamId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY)
  } catch {
    return null
  }
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
  isAppBootstrapping: true,
  refreshMe: () => Promise.resolve(null as unknown as MeResponse),
  setActiveTeamId: () => {},
  clearActiveTeam: () => {},
  setOnboardingResolving: () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  // Ref keeps the latest `me` accessible from stable callbacks (setActiveTeamId)
  // without re-creating them on every `me` change.
  // Updated in two places: eagerly inside fetchMe (before re-render), and
  // via effect to stay in sync with any other setMe calls.
  const meRef = useRef<MeResponse | null>(null)
  useEffect(() => {
    meRef.current = me
  }, [me])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Persisted team selection (for multi-team coaches). Initialised from
  // localStorage on first render; updated via setActiveTeamId / clearActiveTeam.
  const [localTeamId, setLocalTeamId] = useState<string | null>(
    safeGetLocalTeamId,
  )
  const [onboardingResolving, setOnboardingResolving] = useState(false)

  const fetchMe = useCallback(
    async (signal?: AbortSignal): Promise<MeResponse> => {
      const data = await request<MeResponse>('/v1/me', {
        signal,
        teamScoped: false,
      } as RequestInit & { teamScoped: boolean })
      // Update ref eagerly so setActiveTeamId (called right after await
      // refreshMe()) can validate against the fresh memberships without
      // waiting for the React re-render triggered by setMe.
      meRef.current = data
      setMe(data)
      return data
    },
    [],
  )

  const refreshMe = useCallback(async (): Promise<MeResponse> => {
    return fetchMe()
  }, [fetchMe])

  // Initial bootstrap fetch on mount.
  useEffect(() => {
    const controller = new AbortController()

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    fetchMe(controller.signal)
      .then(() => {
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err : new Error('Failed to load profile'))
        setLoading(false)
      })

    return () => controller.abort()
  }, [fetchMe])

  // Resolved team: server value → validated localStorage → null.
  const resolvedActiveTeamId = useMemo<string | null>(() => {
    if (!me) return null
    if (me.active_team_id) return me.active_team_id
    if (
      localTeamId &&
      isValidUuid(localTeamId) &&
      me.memberships.some((m) => m.team_id === localTeamId)
    ) {
      return localTeamId
    }
    return null
  }, [me, localTeamId])

  // Keep the module-level store in sync so httpClient can read it.
  useEffect(() => {
    _setActiveTeamIdInternal(resolvedActiveTeamId)
  }, [resolvedActiveTeamId])

  const setActiveTeamId = useCallback(
    (id: string) => {
      // Read from ref so this callback always sees the latest `me`,
      // even when called right after an awaited refreshMe() whose
      // setMe() hasn't triggered a re-render yet.
      const currentMe = meRef.current
      if (!currentMe) return
      if (!isValidUuid(id)) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[AuthContext] setActiveTeamId: invalid UUID', id)
        }
        return
      }
      if (!currentMe.memberships.some((m) => m.team_id === id)) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[AuthContext] setActiveTeamId: team not in user memberships',
            id,
          )
        }
        return
      }
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, id)
      } catch {
        // localStorage unavailable (e.g. storage quota exceeded)
      }
      // Update the module-level store immediately to avoid a stale-team window
      // between this state update and the follow-up sync effect.
      _setActiveTeamIdInternal(id)
      // No global store reset needed. The Team Picker calls router.replace('/home')
      // after this, which unmounts all team-scoped components and discards their
      // local state automatically. There is no Zustand/Redux/Jotai to flush.
      setLocalTeamId(id)
    },
    [],
  )

  const clearActiveTeam = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY)
    } catch {
      // ignore
    }
    setLocalTeamId(null)
  }, [])

  const role = me ? deriveRole(me, resolvedActiveTeamId) : null

  const isAppBootstrapping = loading || onboardingResolving

  const value: AuthContextValue = {
    me,
    role,
    activeTeamId: resolvedActiveTeamId,
    loading,
    error,
    isAppBootstrapping,
    refreshMe,
    setActiveTeamId,
    clearActiveTeam,
    setOnboardingResolving,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Returns the full auth context value. */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
