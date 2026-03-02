'use client'

import Link from 'next/link'
import { Skeleton } from '@/app/_shared/components/Skeleton'
import { useTeamOverview } from './useTeamOverview'

function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string
  value: number | string
  sublabel?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-5">
      <span className="text-3xl font-semibold text-zinc-900">{value}</span>
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {sublabel && <span className="text-xs text-zinc-400">{sublabel}</span>}
    </div>
  )
}

function QuickAction({
  href,
  label,
  description,
}: {
  href: string
  label: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <span className="text-sm font-medium text-zinc-900">{label}</span>
      <span className="text-xs text-zinc-500">{description}</span>
    </Link>
  )
}

export function TeamOverviewCards() {
  const state = useTeamOverview()

  if (state.status === 'loading') {
    return (
      <div className="mt-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    )
  }

  if (state.status === 'error') return null

  const { data } = state
  const totalSessions = data.pendingCount + data.completedCount
  const completionRate =
    totalSessions > 0 ? Math.round((data.completedCount / totalSessions) * 100) : 0

  return (
    <div className="mt-6 space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-4">
        <StatTile
          label="Athletes"
          value={data.athletes.length}
          sublabel="in your team"
        />
        <StatTile
          label="Pending sessions"
          value={data.pendingCount}
          sublabel="awaiting completion"
        />
        <StatTile
          label="Completion rate"
          value={`${completionRate}%`}
          sublabel={`${data.completedCount} of ${totalSessions} done`}
        />
      </div>

      {/* Low adherence alert */}
      {data.lowAdherenceAthletes.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-medium text-amber-800">
            {data.lowAdherenceAthletes.length === 1
              ? "1 athlete hasn\u2019t completed any session yet"
              : `${data.lowAdherenceAthletes.length} athletes haven\u2019t completed any session yet`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.lowAdherenceAthletes.map((a) => (
              <li
                key={a.athlete_id}
                className="rounded-full bg-amber-100 px-3 py-0.5 text-xs text-amber-700"
              >
                {a.display_name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-700">Quick actions</h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <QuickAction
            href="/templates"
            label="Templates"
            description="Create or manage workout templates"
          />
          <QuickAction
            href="/sessions"
            label="Sessions"
            description="Review team session activity"
          />
          <QuickAction
            href="/sessions"
            label="Schedule"
            description="View the session calendar"
          />
        </div>
      </div>
    </div>
  )
}
