'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Badge } from '@/app/_shared/components/Badge'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useActivationState } from '@/src/features/activation/useActivationState'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeekIso(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday = start of week
  d.setDate(d.getDate() - diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type StatusGroup = 'overdue' | 'today' | 'upcoming' | 'completed'

function getStatusGroup(s: WorkoutSessionSummary): StatusGroup {
  if (s.completed_at) return 'completed'
  if (!s.scheduled_for) return 'upcoming'
  const today = todayIso()
  const scheduledDate = s.scheduled_for.split('T')[0]
  if (scheduledDate === today) return 'today'
  if (scheduledDate < today) return 'overdue'
  return 'upcoming'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

interface KpiData {
  today: number
  upcoming: number
  overdue: number
  completedThisWeek: number
}

function computeKpis(sessions: WorkoutSessionSummary[]): KpiData {
  const weekStart = startOfWeekIso()
  let today = 0
  let upcoming = 0
  let overdue = 0
  let completedThisWeek = 0

  for (const s of sessions) {
    const group = getStatusGroup(s)
    switch (group) {
      case 'today':
        today++
        break
      case 'upcoming':
        upcoming++
        break
      case 'overdue':
        overdue++
        break
      case 'completed':
        if (s.completed_at && s.completed_at.split('T')[0] >= weekStart) {
          completedThisWeek++
        }
        break
    }
  }

  return { today, upcoming, overdue, completedThisWeek }
}

// ---------------------------------------------------------------------------
// Upcoming sessions (next 5 non-completed)
// ---------------------------------------------------------------------------

function getUpcomingSessions(sessions: WorkoutSessionSummary[]): WorkoutSessionSummary[] {
  return sessions
    .filter((s) => !s.completed_at)
    .sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''))
    .slice(0, 5)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { role, isLoading: activationLoading } = useActivationState()

  // Redirect non-coach users
  useEffect(() => {
    if (!activationLoading && role && role !== 'COACH') {
      router.replace('/sessions')
    }
  }, [activationLoading, role, router])

  useEffect(() => {
    document.title = 'Dashboard | Mettle Performance'
  }, [])

  useEffect(() => {
    request<WorkoutSessionSummary[]>('/v1/workout-sessions')
      .then(setSessions)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setError('Failed to load dashboard data. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  if (activationLoading || (role && role !== 'COACH')) {
    return null
  }

  const kpis = computeKpis(sessions)
  const upcomingSessions = getUpcomingSessions(sessions)
  const hasOverdue = kpis.overdue > 0

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Dashboard</h1>

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

      {!loading && !error && (
        <>
          {/* KPI Cards */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard testId="kpi-today" label="Today" value={kpis.today} accent="text-white" />
            <KpiCard testId="kpi-upcoming" label="Upcoming" value={kpis.upcoming} accent="text-blue-400" />
            <KpiCard testId="kpi-overdue" label="Overdue" value={kpis.overdue} accent="text-red-400" />
            <KpiCard testId="kpi-completed" label="Completed this week" value={kpis.completedThisWeek} accent="text-emerald-400" />
          </div>

          {/* Attention required */}
          {hasOverdue && (
            <div className="mt-6 rounded-lg border border-red-800/50 bg-red-900/20 p-4">
              <p className="text-sm font-medium text-red-400">
                {kpis.overdue} overdue session{kpis.overdue > 1 ? 's' : ''} need attention
              </p>
              <Link
                href="/sessions"
                className="mt-1 inline-block text-xs text-red-300 hover:text-red-200"
              >
                View sessions →
              </Link>
            </div>
          )}

          {/* Upcoming sessions */}
          <section className="mt-8" aria-label="Upcoming sessions">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Upcoming Sessions
              </h2>
              {upcomingSessions.length > 0 && (
                <Link href="/sessions" className="text-xs text-slate-400 hover:text-white">
                  View all →
                </Link>
              )}
            </div>

            {upcomingSessions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No sessions yet</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {upcomingSessions.map((s) => {
                  const group = getStatusGroup(s)
                  const badgeVariant = group === 'overdue' ? 'overdue' : 'pending'
                  const badgeLabel = group === 'overdue' ? 'Overdue' : group === 'today' ? 'Today' : 'Upcoming'

                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{s.template_title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {s.athlete_name}
                          {s.scheduled_for && ` · ${formatDate(s.scheduled_for)}`}
                        </p>
                      </div>
                      <div className="ml-3 flex items-center gap-3">
                        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                        <Link
                          href={`/sessions/${s.id}`}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          View →
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Quick actions */}
          <section className="mt-8" aria-label="Quick actions">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Quick Actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickAction href="/templates" label="New template" />
              <QuickAction href="/sessions" label="View sessions" />
              <QuickAction href="/exercises" label="New exercise" />
              <QuickAction href="/team" label="Manage team" />
            </div>
          </section>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  testId,
  label,
  value,
  accent,
}: {
  testId: string
  label: string
  value: number
  accent: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-white/8 bg-[#131922] p-4"
    >
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center rounded-lg border border-white/8 bg-[#131922] px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-white/15 hover:bg-white/5 hover:text-white"
    >
      {label}
    </Link>
  )
}
