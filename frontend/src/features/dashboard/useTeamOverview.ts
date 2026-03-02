import { useEffect, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

export interface Athlete {
  athlete_id: string
  display_name: string
}

export interface TeamOverview {
  athletes: Athlete[]
  sessions: WorkoutSessionSummary[]
  pendingCount: number
  completedCount: number
  /** Athletes who have at least one session assigned but none completed. */
  lowAdherenceAthletes: Athlete[]
}

export type TeamOverviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; data: TeamOverview }

export function useTeamOverview(): TeamOverviewState {
  const [state, setState] = useState<TeamOverviewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    Promise.all([
      request<WorkoutSessionSummary[]>('/v1/workout-sessions'),
      request<Athlete[]>('/v1/athletes'),
    ])
      .then(([sessions, athletes]) => {
        if (cancelled) return

        const pendingCount = sessions.filter((s) => !s.completed_at).length
        const completedCount = sessions.filter((s) => s.completed_at).length

        const athleteIdsWithSessions = new Set(sessions.map((s) => s.athlete_id))
        const athleteIdsWithCompleted = new Set(
          sessions.filter((s) => s.completed_at).map((s) => s.athlete_id),
        )
        const lowAdherenceAthletes = athletes.filter(
          (a) =>
            athleteIdsWithSessions.has(a.athlete_id) &&
            !athleteIdsWithCompleted.has(a.athlete_id),
        )

        setState({
          status: 'ok',
          data: { athletes, sessions, pendingCount, completedCount, lowAdherenceAthletes },
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
