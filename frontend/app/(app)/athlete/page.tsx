'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { EmptyState } from '@/app/_shared/components/EmptyState'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { TodaySessionCard } from '@/src/features/athlete/components/TodaySessionCard'
import { getAthleteSessionList } from '@/src/features/athlete/api'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AthleteHomePage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    document.title = "Today's Workout | Mettle Performance"
  }, [])

  useEffect(() => {
    getAthleteSessionList()
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

  const pendingSession = sessions.find((s) => !s.completed_at) ?? null
  const recentCompleted = sessions.filter((s) => s.completed_at).slice(0, 5)

  return (
    <>
      <h1 className="text-xl font-semibold text-zinc-900">Today's Workout</h1>

      {loading && (
        <div className="mt-6">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={2} />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          title="No session today"
          description="Your coach hasn't assigned a session yet. Check back soon."
        />
      )}

      {!loading && !error && pendingSession && (
        <div className="mt-6">
          <TodaySessionCard session={pendingSession} />
        </div>
      )}

      {!loading && !error && !pendingSession && sessions.length > 0 && (
        <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-center">
          <p className="text-sm font-medium text-emerald-700">
            All sessions done for today. Great work!
          </p>
        </div>
      )}

      {!loading && recentCompleted.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-400">
            Recent
          </h2>
          <ul className="mt-3 space-y-2">
            {recentCompleted.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/athlete/session/${s.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white px-4 py-3 transition-colors hover:bg-zinc-50"
                >
                  <span className="text-sm text-zinc-700">
                    {s.template_title}
                    {s.scheduled_for && (
                      <span className="ml-2 text-zinc-400">
                        · {formatDate(s.scheduled_for)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-medium text-emerald-600">
                    Completed
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
