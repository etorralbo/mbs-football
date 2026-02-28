import { request } from '@/app/_shared/api/httpClient'
import type { SessionExecution } from '@/app/_shared/api/types'

export function getSessionExecution(sessionId: string): Promise<SessionExecution> {
  return request<SessionExecution>(`/v1/workout-sessions/${sessionId}/execution`)
}
