'use client'

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
    <div className="flex flex-col gap-1 rounded-lg border border-white/8 bg-[#131922] p-5">
      <span className="text-3xl font-bold text-white">{value}</span>
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {sublabel && <span className="text-xs text-slate-500">{sublabel}</span>}
    </div>
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
          className="rounded-lg border border-amber-800/40 bg-amber-900/20 p-4"
        >
          <p className="text-sm font-medium text-amber-400">
            {data.lowAdherenceAthletes.length === 1
              ? "1 athlete hasn\u2019t completed any session yet"
              : `${data.lowAdherenceAthletes.length} athletes haven\u2019t completed any session yet`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.lowAdherenceAthletes.map((a) => (
              <li
                key={a.athlete_id}
                className="rounded-full bg-amber-900/40 px-3 py-0.5 text-xs text-amber-400"
              >
                {a.display_name}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
