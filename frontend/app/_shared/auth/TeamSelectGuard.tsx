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

// Paths where the Team Picker redirect must NOT fire.
// - /team/select  : the picker itself (would cause an infinite loop)
// - /create-team  : a coach without any selected team must still be able to
//                   create a new team from the nav or after onboarding
// - /join         : same rationale — joining a team is a bootstrap action
const EXCLUDED_PATHS = [TEAM_SELECT_PATH, '/create-team', '/join']

interface TeamSelectGuardProps {
  children: React.ReactNode
}

export function TeamSelectGuard({ children }: TeamSelectGuardProps) {
  const { activeTeamId, loading, me } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Use memberships rather than the derived `role` so that a mixed-role user
  // (COACH of team A, ATHLETE of team B) is correctly identified as a coach
  // even when no team is selected yet (role would be null or wrong).
  const isCoach = me !== null && me.memberships.some((m) => m.role === 'COACH')

  const needsPicker =
    !loading &&
    me !== null &&
    isCoach &&
    activeTeamId === null &&
    !EXCLUDED_PATHS.includes(pathname)

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
