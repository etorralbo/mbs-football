'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Badge } from '@/app/_shared/components/Badge'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { ActivationBanner } from '@/src/features/activation/components/ActivationBanner'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function sessionLabel(s: WorkoutSessionSummary): string {
  const date = s.scheduled_for ? ` · ${formatDate(s.scheduled_for)}` : ''
  return `${s.template_title}${date}`
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    document.title = 'Sessions | Mettle Performance'
  }, [])

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

      <div className="mt-4">
        <ActivationBanner />
      </div>

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
                <span className="text-sm font-medium text-zinc-900">
                  {sessionLabel(s)}
                </span>
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
