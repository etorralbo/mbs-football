'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

function statusLabel(session: WorkoutSessionSummary): string {
  return session.completed_at ? 'Completed' : 'Pending'
}

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
      <h1 className="text-2xl font-semibold text-gray-900">Workout Sessions</h1>

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && sessions.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">No sessions assigned yet.</p>
      )}

      {!loading && sessions.length > 0 && (
        <ul className="mt-6 divide-y divide-gray-200">
          {sessions.map((s) => (
            <li key={s.id} className="py-4">
              <Link
                href={`/sessions/${s.id}`}
                className="font-medium text-gray-900 hover:underline"
              >
                Session {s.id.slice(0, 8)}…
              </Link>
              <div className="mt-1 flex gap-4 text-sm text-gray-500">
                <span>{statusLabel(s)}</span>
                {s.scheduled_for && <span>{s.scheduled_for}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
