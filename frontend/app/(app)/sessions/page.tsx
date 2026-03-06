'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
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

// ---------------------------------------------------------------------------
// Status grouping helpers
// ---------------------------------------------------------------------------

type StatusGroup = 'overdue' | 'today' | 'upcoming' | 'completed'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getStatusGroup(s: WorkoutSessionSummary): StatusGroup {
  if (s.completed_at) return 'completed'
  if (!s.scheduled_for) return 'upcoming'

  const today = todayIso()
  const scheduledDate = s.scheduled_for.split('T')[0]

  if (scheduledDate === today) return 'today'
  if (scheduledDate < today) return 'overdue'
  return 'upcoming'
}

function sortByDateAsc(a: WorkoutSessionSummary, b: WorkoutSessionSummary): number {
  return (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? '')
}

function sortByDateDesc(a: WorkoutSessionSummary, b: WorkoutSessionSummary): number {
  return (b.completed_at ?? b.scheduled_for ?? '').localeCompare(a.completed_at ?? a.scheduled_for ?? '')
}

interface StatusSection {
  key: StatusGroup
  label: string
  sessions: WorkoutSessionSummary[]
}

function groupByStatus(sessions: WorkoutSessionSummary[]): StatusSection[] {
  const groups: Record<StatusGroup, WorkoutSessionSummary[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    completed: [],
  }
  for (const s of sessions) {
    groups[getStatusGroup(s)].push(s)
  }
  // Sort within sections
  groups.overdue.sort(sortByDateAsc)
  groups.today.sort(sortByDateAsc)
  groups.upcoming.sort(sortByDateAsc)
  groups.completed.sort(sortByDateDesc)

  const sections: StatusSection[] = [
    { key: 'overdue', label: 'Overdue', sessions: groups.overdue },
    { key: 'today', label: 'Today', sessions: groups.today },
    { key: 'upcoming', label: 'Upcoming', sessions: groups.upcoming },
    { key: 'completed', label: 'Completed', sessions: groups.completed },
  ]
  return sections.filter((g) => g.sessions.length > 0)
}

// ---------------------------------------------------------------------------
// Athlete grouping (kept for athlete filter options)
// ---------------------------------------------------------------------------

type AthleteOption = { id: string; name: string }

function uniqueAthletes(sessions: WorkoutSessionSummary[]): AthleteOption[] {
  const map = new Map<string, string>()
  for (const s of sessions) {
    if (!map.has(s.athlete_id)) map.set(s.athlete_id, s.athlete_name)
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Kebab menu
// ---------------------------------------------------------------------------

function KebabMenu({
  session,
  onUnassign,
}: {
  session: WorkoutSessionSummary
  onUnassign: (s: WorkoutSessionSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white"
        aria-label={`Actions for ${session.template_title}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-white/10 bg-[#1a2233] py-1 shadow-xl"
        >
          <button
            role="menuitem"
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            onClick={() => { setOpen(false) }}
          >
            Reschedule
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            onClick={() => { setOpen(false) }}
          >
            Duplicate session
          </button>
          {!session.completed_at && (
            <button
              role="menuitem"
              className="flex w-full items-center px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5 hover:text-red-300"
              onClick={() => { setOpen(false); onUnassign(session) }}
            >
              Unassign
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function sessionBadge(s: WorkoutSessionSummary): { variant: 'completed' | 'overdue' | 'in_progress' | 'pending'; label: string } {
  if (s.completed_at) return { variant: 'completed', label: 'Completed' }
  const group = getStatusGroup(s)
  if (group === 'overdue') return { variant: 'overdue', label: 'Overdue' }
  const logged = s.exercises_logged_count ?? 0
  if (logged > 0) return { variant: 'in_progress', label: 'In progress' }
  return { variant: 'pending', label: 'Pending' }
}

function exerciseProgress(s: WorkoutSessionSummary): string {
  const total = s.exercise_count ?? 0
  const logged = s.exercises_logged_count ?? 0
  if (logged > 0 && total > 0) return `${logged} / ${total} exercises`
  return `${total} exercises`
}

function SessionCard({
  session: s,
  role,
  onUnassign,
}: {
  session: WorkoutSessionSummary
  role: string | null | undefined
  onUnassign: (s: WorkoutSessionSummary) => void
}) {
  const badge = sessionBadge(s)

  return (
    <li className="rounded-lg border border-white/8 bg-[#131922] p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Left: workout info */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {s.template_title}
          </h3>
          {s.scheduled_for && (
            <p className="mt-0.5 text-xs text-slate-400">{formatDate(s.scheduled_for)}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            {role === 'COACH' && (
              <span>Athlete: <span className="text-slate-300">{s.athlete_name}</span></span>
            )}
            <span>{exerciseProgress(s)}</span>
          </div>
        </div>

        {/* Right: kebab menu (COACH only) */}
        {role === 'COACH' && (
          <KebabMenu session={s} onUnassign={onUnassign} />
        )}
      </div>

      {/* Bottom: badge + view link */}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
        <Badge variant={badge.variant}>
          {badge.label}
        </Badge>
        {role === 'ATHLETE' && !s.completed_at ? (
          <Link
            href={`/sessions/${s.id}`}
            className="inline-flex items-center rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755]"
          >
            Start session
          </Link>
        ) : (
          <Link
            href={`/sessions/${s.id}`}
            className="text-sm text-slate-400 hover:text-white"
          >
            View →
          </Link>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Welcome banner
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

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

  const athleteOptions = uniqueAthletes(sessions)
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

  function openUnassign(s: WorkoutSessionSummary) {
    setCancelError(null)
    setConfirmCancel(s)
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
            title="You're all set"
            description="Your coach will assign sessions soon."
          />
        )
      )}

      {!loading && visibleSessions.length > 0 && viewMode === 'calendar' && (
        <CalendarView
          sessions={visibleSessions}
          role={role}
          onUnassign={openUnassign}
        />
      )}

      {/* COACH — grouped by status */}
      {!loading && visibleSessions.length > 0 && viewMode === 'list' && role === 'COACH' && (
        <div className="mt-6 space-y-8">
          {groupByStatus(visibleSessions).map(({ key, label, sessions: group }) => (
            <section key={key} aria-label={label}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {label}
              </h2>
              <ul className="space-y-3">
                {group.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    role={role}
                    onUnassign={openUnassign}
                  />
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

      {/* ATHLETE — flat list with cards */}
      {!loading && visibleSessions.length > 0 && viewMode === 'list' && role === 'ATHLETE' && (
        <ul className="mt-6 space-y-3">
          {visibleSessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              role={role}
              onUnassign={openUnassign}
            />
          ))}
        </ul>
      )}
    </>
  )
}
