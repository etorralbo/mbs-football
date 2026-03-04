'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_VISIBLE = 2

const ATHLETE_COLORS = [
  '#4f9cf9',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#06b6d4',
]

function athleteColor(athleteId: string): string {
  let hash = 0
  for (const ch of athleteId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return ATHLETE_COLORS[Math.abs(hash) % ATHLETE_COLORS.length]
}

function isoToLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day)
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function sessionStatus(s: WorkoutSessionSummary): string {
  if (s.completed_at) return 'Completed'
  if (s.cancelled_at) return 'Cancelled'
  return 'Scheduled'
}

interface Props {
  sessions: WorkoutSessionSummary[]
  role?: string | null
  onUnassign?: (session: WorkoutSessionSummary) => void
}

export function CalendarView({ sessions, role, onUnassign }: Props) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [popoverDay, setPopoverDay] = useState<Date | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  // Close popover on Escape or click outside
  useEffect(() => {
    if (!popoverDay) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopoverDay(null)
    }
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverDay(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [popoverDay])

  // Build the grid: start on Monday, fill leading/trailing empty cells
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayIndex = i - startOffset + 1
    if (dayIndex < 1 || dayIndex > daysInMonth) return null
    return new Date(year, month, dayIndex)
  })

  const scheduledSessions = sessions.filter((s) => {
    if (!s.scheduled_for) return false
    const d = isoToLocalDate(s.scheduled_for)
    return d.getFullYear() === year && d.getMonth() === month
  })

  function sessionsForDay(date: Date): WorkoutSessionSummary[] {
    return scheduledSessions.filter((s) => sameDay(isoToLocalDate(s.scheduled_for!), date))
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="mt-6 rounded-lg border border-white/8 bg-[#131922]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <button
          aria-label="Previous month"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
        >
          ←
        </button>
        <span className="text-sm font-semibold text-white">{monthLabel}</span>
        <button
          aria-label="Next month"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
        >
          →
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-white/5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-slate-500">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          const isToday = date ? sameDay(date, today) : false
          const daySessions = date ? sessionsForDay(date) : []
          const overflow = daySessions.length > MAX_VISIBLE
          const visible = overflow ? daySessions.slice(0, MAX_VISIBLE) : daySessions
          const remaining = daySessions.length - MAX_VISIBLE
          const isPopoverOpen = popoverDay !== null && date !== null && sameDay(popoverDay, date)

          return (
            <div
              key={i}
              className={`relative min-h-[90px] border-b border-r border-white/5 p-1 last:border-r-0 ${
                !date ? 'bg-white/3' : ''
              }`}
            >
              {date && (
                <>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? 'bg-[#c8f135] font-bold text-[#0a0d14]'
                        : 'text-slate-500'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {visible.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        role={role}
                        onUnassign={onUnassign}
                      />
                    ))}
                    {overflow && (
                      <button
                        onClick={() => setPopoverDay(date)}
                        className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-slate-400 hover:bg-white/5 hover:text-white"
                        aria-label={`Show ${remaining} more sessions`}
                      >
                        +{remaining} more
                      </button>
                    )}
                  </div>

                  {/* Day popover */}
                  {isPopoverOpen && (
                    <div
                      ref={popoverRef}
                      role="dialog"
                      aria-label={`Sessions for ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-white/10 bg-[#131922] p-3 shadow-2xl"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">
                          {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <button
                          onClick={() => setPopoverDay(null)}
                          className="text-xs text-slate-400 hover:text-white"
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>
                      <ul className="space-y-2">
                        {daySessions.map((s) => (
                          <li
                            key={s.id}
                            className="rounded-md border border-white/5 bg-white/3 p-2"
                            style={{ borderLeftColor: athleteColor(s.athlete_id), borderLeftWidth: 3 }}
                          >
                            <div className="truncate text-xs font-medium text-white" title={s.athlete_name}>
                              {s.athlete_name}
                            </div>
                            <div className="truncate text-[10px] text-slate-400" title={s.template_title}>
                              {s.template_title}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span
                                className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                                  s.completed_at
                                    ? 'bg-emerald-900/30 text-emerald-400'
                                    : 'bg-amber-900/30 text-amber-400'
                                }`}
                              >
                                {sessionStatus(s)}
                              </span>
                              <Link
                                href={`/sessions/${s.id}`}
                                className="text-[10px] text-slate-400 hover:text-white"
                              >
                                View
                              </Link>
                              {role === 'COACH' && !s.completed_at && onUnassign && (
                                <button
                                  onClick={() => { onUnassign(s); setPopoverDay(null) }}
                                  className="text-[10px] text-red-400 hover:text-red-300"
                                  aria-label={`Unassign ${s.athlete_name}`}
                                >
                                  Unassign
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SessionCard({
  session: s,
  role,
  onUnassign,
}: {
  session: WorkoutSessionSummary
  role?: string | null
  onUnassign?: (session: WorkoutSessionSummary) => void
}) {
  const color = athleteColor(s.athlete_id)

  return (
    <div className="group relative flex items-center">
      <Link
        href={`/sessions/${s.id}`}
        className={`block min-w-0 flex-1 rounded border-l-2 px-1.5 py-0.5 text-xs leading-tight ${
          s.completed_at
            ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60'
            : 'bg-[#4f9cf9]/15 text-[#4f9cf9] hover:bg-[#4f9cf9]/25'
        }`}
        style={{ borderLeftColor: color }}
        title={`${s.athlete_name} — ${s.template_title}`}
      >
        <span className="block truncate text-[10px] font-semibold leading-tight text-white">
          {s.athlete_name}
        </span>
        <span className="block truncate text-[10px] leading-tight opacity-70">
          {s.template_title}
        </span>
      </Link>
      {role === 'COACH' && !s.completed_at && onUnassign && (
        <button
          onClick={() => onUnassign(s)}
          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none text-white hover:bg-red-500 group-hover:flex"
          aria-label={`Unassign ${s.athlete_name}`}
          title="Unassign"
        >
          ×
        </button>
      )}
    </div>
  )
}
