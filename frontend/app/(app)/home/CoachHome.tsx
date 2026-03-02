'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import type { Exercise, WorkoutSessionSummary, WorkoutTemplate } from '@/app/_shared/api/types'
import { Badge } from '@/app/_shared/components/Badge'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useTeamOverview } from '@/src/features/dashboard/useTeamOverview'

// ---------------------------------------------------------------------------
// Shared section card wrapper
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string
  viewAllHref: string
  children: React.ReactNode
}

function SectionCard({ title, viewAllHref, children }: SectionCardProps) {
  return (
    <div className="rounded-lg border border-white/8 bg-[#131922] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <Link
          href={viewAllHref}
          className="text-xs text-[#4f9cf9] transition-opacity hover:opacity-75"
        >
          View all →
        </Link>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1 — Templates
// ---------------------------------------------------------------------------

type AsyncState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T }

function TemplatesPreview() {
  const [state, setState] = useState<AsyncState<WorkoutTemplate[]>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    request<WorkoutTemplate[]>('/v1/workout-templates')
      .then((data) => { if (!cancelled) setState({ status: 'ok', data }) })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [])

  return (
    <SectionCard title="Workout Templates" viewAllHref="/templates">
      {state.status === 'loading' && <SkeletonList rows={3} />}
      {state.status === 'error' && (
        <p className="text-xs text-red-400">Could not load templates.</p>
      )}
      {state.status === 'ok' && state.data.length === 0 && (
        <p className="text-xs text-slate-500">
          No templates yet — create one to assign sessions.
        </p>
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="space-y-2">
          {state.data.slice(0, 3).map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="block truncate text-sm text-slate-300 hover:text-white"
              >
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Sessions (coach view)
// ---------------------------------------------------------------------------

function SessionsPreview() {
  const [state, setState] = useState<AsyncState<WorkoutSessionSummary[]>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    request<WorkoutSessionSummary[]>('/v1/workout-sessions')
      .then((data) => { if (!cancelled) setState({ status: 'ok', data }) })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [])

  const pendingCount =
    state.status === 'ok' ? state.data.filter((s) => !s.completed_at).length : 0

  return (
    <SectionCard title="Sessions" viewAllHref="/sessions">
      {state.status === 'loading' && <SkeletonList rows={3} />}
      {state.status === 'error' && (
        <p className="text-xs text-red-400">Could not load sessions.</p>
      )}
      {state.status === 'ok' && state.data.length === 0 && (
        <p className="text-xs text-slate-500">No sessions assigned yet.</p>
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-white">{pendingCount}</span> pending
          </p>
          <ul className="space-y-2">
            {state.data.slice(0, 3).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-300">{s.template_title}</p>
                  <p className="truncate text-xs text-slate-500">{s.athlete_name}</p>
                </div>
                <Badge variant={s.completed_at ? 'completed' : 'pending'}>
                  {s.completed_at ? 'Done' : 'Pending'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Exercises
// ---------------------------------------------------------------------------

function ExercisesPreview() {
  const [state, setState] = useState<AsyncState<Exercise[]>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    request<Exercise[]>('/v1/exercises')
      .then((data) => { if (!cancelled) setState({ status: 'ok', data }) })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [])

  return (
    <SectionCard title="Exercise Library" viewAllHref="/exercises">
      {state.status === 'loading' && <SkeletonList rows={3} />}
      {state.status === 'error' && (
        <p className="text-xs text-red-400">Could not load exercises.</p>
      )}
      {state.status === 'ok' && state.data.length === 0 && (
        <p className="text-xs text-slate-500">No exercises yet.</p>
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-white">{state.data.length}</span>{' '}
            exercise{state.data.length === 1 ? '' : 's'} in library
          </p>
          <ul className="space-y-1">
            {state.data.slice(0, 3).map((e) => (
              <li key={e.id} className="truncate text-sm text-slate-300">
                {e.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — Team
// ---------------------------------------------------------------------------

function TeamPreview() {
  const teamState = useTeamOverview()

  return (
    <SectionCard title="Team" viewAllHref="/team">
      {teamState.status === 'loading' && <SkeletonList rows={3} />}
      {teamState.status === 'error' && (
        <p className="text-xs text-red-400">Could not load team data.</p>
      )}
      {teamState.status === 'ok' && teamState.data.athletes.length === 0 && (
        <p className="text-xs text-slate-500">
          No athletes yet — go to Team to invite them.
        </p>
      )}
      {teamState.status === 'ok' && teamState.data.athletes.length > 0 && (
        <ul className="space-y-1.5">
          {teamState.data.athletes.slice(0, 3).map((athlete) => (
            <li key={athlete.athlete_id} className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-semibold text-slate-300">
                {athlete.display_name.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-sm text-slate-200">{athlete.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// CoachHome
// ---------------------------------------------------------------------------

export function CoachHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          An overview of your team and training content.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TemplatesPreview />
        <SessionsPreview />
        <ExercisesPreview />
        <TeamPreview />
      </div>
    </div>
  )
}
