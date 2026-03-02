'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'
import { Badge } from '@/app/_shared/components/Badge'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { TodaySessionCard } from '@/src/features/athlete/components/TodaySessionCard'
import { ProgressSection } from '@/src/features/athlete/components/ProgressSection'

// ---------------------------------------------------------------------------
// Shared sessions fetch
// ---------------------------------------------------------------------------

interface AthleteHomeData {
  status: 'loading' | 'error' | 'ok'
  pending: WorkoutSessionSummary[]
  completed: WorkoutSessionSummary[]
}

function useAthleteHomeData(): AthleteHomeData {
  const [state, setState] = useState<AthleteHomeData>({
    status: 'loading',
    pending: [],
    completed: [],
  })

  useEffect(() => {
    let cancelled = false
    request<WorkoutSessionSummary[]>('/v1/workout-sessions')
      .then((sessions) => {
        if (cancelled) return
        setState({
          status: 'ok',
          pending: sessions.filter((s) => !s.completed_at),
          completed: sessions.filter((s) => !!s.completed_at),
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', pending: [], completed: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// AthleteHome
// ---------------------------------------------------------------------------

export function AthleteHome() {
  const data = useAthleteHomeData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Home</h1>
        <p className="mt-1 text-sm text-slate-400">Your training at a glance.</p>
      </div>

      {/* Training — full width */}
      <section aria-live="polite" aria-busy={data.status === 'loading'}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">{"Today's Training"}</h2>
          <Link href="/athlete" className="text-xs text-[#4f9cf9] hover:opacity-75">
            View all →
          </Link>
        </div>

        {data.status === 'loading' && <SkeletonList rows={2} />}
        {data.status === 'error' && (
          <p className="text-sm text-red-400">Could not load sessions.</p>
        )}
        {data.status === 'ok' && data.pending.length === 0 && (
          <div className="rounded-xl border border-white/8 bg-[#131922] p-6 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm font-medium text-white">All caught up!</p>
            <p className="mt-1 text-xs text-slate-500">
              No pending sessions. Check back later.
            </p>
            <Link
              href="/sessions"
              className="mt-4 inline-block text-xs text-[#4f9cf9] hover:opacity-75"
            >
              View session history →
            </Link>
          </div>
        )}
        {data.status === 'ok' && data.pending.length > 0 && (
          <TodaySessionCard session={data.pending[0]} />
        )}
      </section>

      {/* Recent Sessions */}
      <div className="rounded-lg border border-white/8 bg-[#131922] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recent Sessions</h2>
          <Link href="/sessions" className="text-xs text-[#4f9cf9] hover:opacity-75">
            View all →
          </Link>
        </div>

        {data.status === 'loading' && <SkeletonList rows={3} />}
        {data.status === 'error' && (
          <p className="text-xs text-red-400">Could not load sessions.</p>
        )}
        {data.status === 'ok' && data.completed.length === 0 && (
          <p className="text-xs text-slate-500">No completed sessions yet.</p>
        )}
        {data.status === 'ok' && data.completed.length > 0 && (
          <ul className="space-y-2">
            {data.completed.slice(0, 3).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-300">{s.template_title}</p>
                  {s.completed_at && (
                    <p className="text-xs text-slate-500">{formatDate(s.completed_at)}</p>
                  )}
                </div>
                <Badge variant="completed">Done</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Progress — self-contained, renders null when no data */}
      <ProgressSection />
    </div>
  )
}
