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

      {/* Athletes roster */}
      {data.athletes.length > 0 && (
        <div className="rounded-lg border border-white/8 bg-[#131922] px-5 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Athletes
            <span className="ml-1.5 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              {data.athletes.length}
            </span>
          </p>
          <ul className="space-y-1.5">
            {data.athletes.map((athlete) => (
              <li key={athlete.athlete_id} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-semibold text-slate-300">
                  {athlete.display_name.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm text-slate-200">{athlete.display_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.athletes.length === 0 && (
        <p className="text-xs text-slate-500">
          No athletes yet — go to Team to generate an invite link.
        </p>
      )}
    </div>
  )
}
