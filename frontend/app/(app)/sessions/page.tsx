'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { request, ConflictError } from '@/app/_shared/api/httpClient'
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
      map.set(s.athlete_id, { id: s.athlete_id, name: s.athlete_name, sessions: [] })
    map.get(s.athlete_id)!.sessions.push(s)
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function WelcomeBanner({ teamName }: { teamName: string }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(id)
  }, [])
  if (!visible) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-[#c8f135]/30 bg-[#131922] px-5 py-3 text-sm font-medium text-[#c8f135] shadow-lg"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
      </svg>
      Bienvenido/a al equipo {teamName}
    </div>
  )
}

function WelcomeBannerWrapper() {
  const searchParams = useSearchParams()
  const [teamName] = useState<string | null>(() => {
    if (searchParams.get('welcome') !== '1') return null
    const stored = sessionStorage.getItem('welcome_team_name')
    if (stored) sessionStorage.removeItem('welcome_team_name')
    return stored
  })

  if (!teamName) return null
  return <WelcomeBanner teamName={teamName} />
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<WorkoutSessionSummary | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
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

  async function handleUnassign() {
    if (!confirmCancel) return
    setCancelError(null)
    setCancelling(true)
    try {
      await request(`/v1/workout-sessions/${confirmCancel.id}/cancel`, { method: 'PATCH' })
      setSessions((prev) => prev.filter((s) => s.id !== confirmCancel.id))
      setConfirmCancel(null)
    } catch (err) {
      if (err instanceof ConflictError) {
        setCancelError("This session can't be unassigned because it has activity or logs.")
      } else {
        setCancelError('Failed to unassign. Please try again.')
      }
    } finally {
      setCancelling(false)
    }
  }

  return (
    <>
      <Suspense>
        <WelcomeBannerWrapper />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">Workout Sessions</h1>
        <div className="flex items-center gap-2">
          {/* Athlete filter — COACH only */}
          {role === 'COACH' && athleteOptions.length > 0 && (
            <select
              value={selectedAthleteId ?? ''}
              onChange={(e) => setSelectedAthleteId(e.target.value || null)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 focus:outline-none [color-scheme:dark]"
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
        <CalendarView
          sessions={visibleSessions}
          role={role}
          onUnassign={(s) => { setCancelError(null); setConfirmCancel(s) }}
        />
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
                      {!s.completed_at && (
                        <button
                          onClick={() => { setCancelError(null); setConfirmCancel(s) }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Unassign
                        </button>
                      )}
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

      {/* Unassign confirmation dialog */}
      {confirmCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { if (!cancelling) setConfirmCancel(null) }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm unassign"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#131922] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white">Unassign session?</h3>
            <p className="mt-2 text-sm text-slate-400">
              Unassign <span className="font-medium text-white">{confirmCancel.athlete_name}</span> from{' '}
              <span className="font-medium text-white">{confirmCancel.template_title}</span>?
              The athlete will no longer see this session.
            </p>
            {cancelError && (
              <p role="alert" className="mt-3 text-sm text-red-400">{cancelError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmCancel(null)}
                disabled={cancelling}
                className="rounded-md px-3 py-1.5 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleUnassign}
                disabled={cancelling}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {cancelling ? 'Unassigning…' : 'Unassign'}
              </button>
            </div>
          </div>
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
