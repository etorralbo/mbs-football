'use client'

/**
 * TeamSelectGuard — routing guard for multi-team coaches.
 *
 * When a COACH has no active team selected (active_team_id is null and no
 * valid localStorage value), this guard redirects to /team/select before
 * rendering any protected content.
 *
 * Athletes are never redirected — their active_team_id is always server-set.
 */

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/src/shared/auth/AuthContext'

const TEAM_SELECT_PATH = '/team/select'

interface TeamSelectGuardProps {
  children: React.ReactNode
}

export function TeamSelectGuard({ children }: TeamSelectGuardProps) {
  const { role, activeTeamId, loading, me } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const needsPicker =
    !loading &&
    me !== null &&
    role === 'COACH' &&
    activeTeamId === null &&
    pathname !== TEAM_SELECT_PATH

  useEffect(() => {
    if (needsPicker) {
      router.replace(TEAM_SELECT_PATH)
    }
  }, [needsPicker, router])

  // Prevent flash of protected content while redirect is in-flight.
  if (needsPicker) {
    return null
  }

  return <>{children}</>
}
