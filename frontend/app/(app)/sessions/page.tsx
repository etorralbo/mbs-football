'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Badge } from '@/app/_shared/components/Badge'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

export default function SessionsPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    request<WorkoutSessionSummary[]>('/v1/workout-sessions')
      .then(setSessions)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setError('Failed to load sessions. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  return (
    <>
      <h1 className="text-xl font-semibold text-zinc-900">Workout Sessions</h1>

      {loading && (
        <div className="mt-6">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={3} />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && sessions.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500">No sessions assigned yet.</p>
      )}

      {!loading && sessions.length > 0 && (
        <ul className="mt-6 space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-900">
                    Session {s.id.slice(0, 8)}…
                  </span>
                  {s.scheduled_for && (
                    <span className="text-xs text-zinc-500">{s.scheduled_for}</span>
                  )}
                </div>
                <Badge variant={s.completed_at ? 'completed' : 'pending'}>
                  {s.completed_at ? 'Completed' : 'Pending'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
