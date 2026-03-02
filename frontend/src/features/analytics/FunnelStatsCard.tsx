'use client'

import { Skeleton } from '@/app/_shared/components/Skeleton'
import { useFunnelStats } from './useFunnelStats'

interface StatTileProps {
  label: string
  value: number
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-center text-xs text-slate-500">{label}</span>
    </div>
  )
}

export function FunnelStatsCard() {
  const state = useFunnelStats(true)

  if (state.status === 'loading') {
    return (
      <div
        aria-label="Loading team activity"
        className="mt-6 rounded-lg border border-white/8 bg-[#131922] p-5"
      >
        <Skeleton className="h-4 w-1/4" />
        <div className="mt-4 flex justify-around">
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    )
  }

  if (state.status === 'error') return null

  const { data } = state
  const pendingInvites = Math.max(0, data.invite_created - data.invite_accepted)

  return (
    <div
      aria-label="Team activity"
      className="mt-6 rounded-lg border border-white/8 bg-[#131922] p-5"
    >
      <h2 className="text-sm font-semibold text-white">Team activity</h2>
      <div className="mt-4 flex justify-around">
        <StatTile label="Pending invites" value={pendingInvites} />
      </div>
    </div>
  )
}
