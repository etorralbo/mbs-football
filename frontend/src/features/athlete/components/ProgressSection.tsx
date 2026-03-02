'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useProgressData } from '../hooks/useProgressData'
import { Skeleton } from '@/app/_shared/components/Skeleton'

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ payload: Record<string, unknown> }>
  label?: string
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const maxLoad = d.maxLoad as number | null | undefined
  const avgRpe = d.avgRpe as number | null | undefined
  const totalSets = d.totalSets as number | undefined
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-zinc-700">{label}</p>
      {maxLoad != null && <p className="text-indigo-600">{maxLoad} kg</p>}
      {avgRpe != null && <p className="text-zinc-500">RPE {avgRpe}</p>}
      {totalSets != null && <p className="text-zinc-400">{totalSets} sets</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProgressSection
// ---------------------------------------------------------------------------

export function ProgressSection() {
  const state = useProgressData()
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (state.status === 'loading') {
    return (
      <div className="mt-8">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (state.status === 'error' || state.status === 'empty') return null

  const { series } = state
  const selected = series[selectedIdx] ?? series[0]

  // Only show exercises that have at least 2 data points (otherwise a line makes no sense).
  const plottable = series.filter((s) => s.points.length >= 2)
  if (plottable.length === 0) return null

  const current = plottable[Math.min(selectedIdx, plottable.length - 1)]
  const hasLoad = current.points.some((p) => p.maxLoad != null)

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Your progress</h2>

        {plottable.length > 1 && (
          <select
            value={plottable.findIndex((s) => s.exerciseId === current.exerciseId)}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            aria-label="Select exercise"
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 focus:border-indigo-400 focus:outline-none"
          >
            {plottable.map((s, i) => (
              <option key={s.exerciseId} value={i}>
                {s.exerciseName}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="mt-0.5 text-xs text-zinc-500">
        {plottable.length === 1 ? current.exerciseName : 'Last sessions logged'}
      </p>

      <div className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-4">
        {hasLoad ? (
          <>
            <p className="mb-2 text-xs text-zinc-400">Max load (kg)</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={current.points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="maxLoad"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-zinc-400">Average RPE</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={current.points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 10]}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avgRpe"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </section>
  )
}
