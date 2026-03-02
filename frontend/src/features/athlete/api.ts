import { request } from '@/app/_shared/api/httpClient'
import type { SessionExecution, WorkoutSessionSummary } from '@/app/_shared/api/types'

export function getAthleteSessionList(): Promise<WorkoutSessionSummary[]> {
  return request<WorkoutSessionSummary[]>('/v1/workout-sessions')
}

export function getSessionExecution(sessionId: string): Promise<SessionExecution> {
  return request<SessionExecution>(`/v1/workout-sessions/${sessionId}/execution`)
}

export interface LogSetsPayload {
  exercise_id: string
  entries: Array<{
    set_number: number
    reps: number | null
    weight: number | null
    rpe: number | null
  }>
}

export function logSets(sessionId: string, payload: LogSetsPayload): Promise<unknown> {
  return request(`/v1/workout-sessions/${sessionId}/logs`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function completeSession(sessionId: string): Promise<unknown> {
  return request(`/v1/workout-sessions/${sessionId}/complete`, { method: 'PATCH' })
}
