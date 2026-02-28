'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Badge } from '@/app/_shared/components/Badge'
import { EmptyState } from '@/app/_shared/components/EmptyState'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { ActivationBanner } from '@/src/features/activation/components/ActivationBanner'
import { useActivationState } from '@/src/features/activation/useActivationState'
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
  const { role, steps, isLoading: activationLoading } = useActivationState()
  const hasTemplates = steps.find((s) => s.key === 'create_template')?.completed ?? false

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
        role === 'COACH' ? (
          !activationLoading && !hasTemplates ? (
            <EmptyState
              title="Start by creating a template"
              description="Build a workout template before assigning sessions to athletes."
              primaryAction={{ label: 'Create with AI', href: '/templates' }}
            />
          ) : (
            <EmptyState
              title="No sessions assigned yet"
              description="Pick a template and assign it to activate your team."
              primaryAction={{ label: 'Choose a template to assign', href: '/templates' }}
            />
          )
        ) : (
          <EmptyState
            title="No sessions assigned yet"
            description="Your coach hasn't assigned a session to you yet. Check back soon."
          />
        )
      )}

      {!loading && sessions.length > 0 && (
        <ul className="mt-6 space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4"
            >
              <span className="text-sm font-medium text-zinc-900">{sessionLabel(s)}</span>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={s.completed_at ? 'completed' : 'pending'}>
                  {s.completed_at ? 'Completed' : 'Pending'}
                </Badge>
                {s.completed_at ? (
                  <Link
                    href={`/sessions/${s.id}`}
                    className="text-sm text-zinc-500 hover:text-zinc-700"
                  >
                    View →
                  </Link>
                ) : (
                  <Link
                    href={`/sessions/${s.id}`}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                  >
                    Start session
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
