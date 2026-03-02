'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Badge } from '@/app/_shared/components/Badge'
import { EmptyState } from '@/app/_shared/components/EmptyState'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useActivationState } from '@/src/features/activation/useActivationState'
import { CalendarView } from '@/src/features/sessions/CalendarView'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

type ViewMode = 'list' | 'calendar'

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

type AthleteGroup = { id: string; name: string; sessions: WorkoutSessionSummary[] }

function groupByAthlete(sessions: WorkoutSessionSummary[]): AthleteGroup[] {
  const map = new Map<string, AthleteGroup>()
  for (const s of sessions) {
    if (!map.has(s.athlete_id))
      map.set(s.athlete_id, { id: s.athlete_id, name: s.athlete_name ?? s.athlete_id, sessions: [] })
    map.get(s.athlete_id)!.sessions.push(s)
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null)
  const router = useRouter()
  const { role, steps, isLoading: activationLoading } = useActivationState()
  const hasTemplates = steps.find((s) => s.key === 'create_template')?.completed ?? false

  const athleteOptions = groupByAthlete(sessions).map(({ id, name }) => ({ id, name }))
  const visibleSessions = selectedAthleteId
    ? sessions.filter((s) => s.athlete_id === selectedAthleteId)
    : sessions

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">Workout Sessions</h1>
        <div className="flex items-center gap-2">
          {/* Athlete filter — COACH only */}
          {role === 'COACH' && athleteOptions.length > 0 && (
            <select
              value={selectedAthleteId ?? ''}
              onChange={(e) => setSelectedAthleteId(e.target.value || null)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
              aria-label="Filter by athlete"
            >
              <option value="">All athletes</option>
              {athleteOptions.map(({ id, name }) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
          {/* View mode toggle */}
          {role && (
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                aria-pressed={viewMode === 'calendar'}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Calendar
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="mt-6">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={3} />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-400">
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

      {!loading && visibleSessions.length > 0 && viewMode === 'calendar' && (
        <CalendarView sessions={visibleSessions} />
      )}

      {/* COACH — grouped by athlete */}
      {!loading && visibleSessions.length > 0 && viewMode === 'list' && role === 'COACH' && (
        <div className="mt-6 space-y-6">
          {groupByAthlete(visibleSessions).map(({ id, name, sessions: group }) => (
            <section key={id}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {name}
              </h2>
              <ul className="space-y-2">
                {group.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] p-4"
                  >
                    <span className="text-sm font-medium text-white">{sessionLabel(s)}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={s.completed_at ? 'completed' : 'pending'}>
                        {s.completed_at ? 'Completed' : 'Pending'}
                      </Badge>
                      <Link
                        href={`/sessions/${s.id}`}
                        className="text-sm text-slate-400 hover:text-white"
                      >
                        View →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* ATHLETE — flat list */}
      {!loading && visibleSessions.length > 0 && viewMode === 'list' && role === 'ATHLETE' && (
        <ul className="mt-6 space-y-2">
          {visibleSessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] p-4"
            >
              <div>
                <span className="text-sm font-medium text-white">{sessionLabel(s)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={s.completed_at ? 'completed' : 'pending'}>
                  {s.completed_at ? 'Completed' : 'Pending'}
                </Badge>
                {s.completed_at ? (
                  <Link
                    href={`/sessions/${s.id}`}
                    className="text-sm text-slate-400 hover:text-white"
                  >
                    View →
                  </Link>
                ) : (
                  <Link
                    href={`/sessions/${s.id}`}
                    className="inline-flex items-center rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755]"
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
