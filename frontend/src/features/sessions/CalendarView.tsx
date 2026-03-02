'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isoToLocalDate(iso: string): Date {
  // Parse only the date part to avoid timezone shifts (e.g. "2025-06-10" → June 10 local time)
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

interface Props {
  sessions: WorkoutSessionSummary[]
}

export function CalendarView({ sessions }: Props) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  // Build the grid: start on Monday, fill leading/trailing empty cells
  const firstDay = new Date(year, month, 1)
  // getDay(): 0=Sun, 1=Mon…6=Sat → convert to Mon-based (0=Mon…6=Sun)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayIndex = i - startOffset + 1
    if (dayIndex < 1 || dayIndex > daysInMonth) return null
    return new Date(year, month, dayIndex)
  })

  // Sessions that have a scheduled_for within this month
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

          return (
            <div
              key={i}
              className={`min-h-[80px] border-b border-r border-white/5 p-1 last:border-r-0 ${
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
                    {daySessions.map((s) => (
                      <Link
                        key={s.id}
                        href={`/sessions/${s.id}`}
                        className={`block truncate rounded px-1 py-0.5 text-xs leading-tight ${
                          s.completed_at
                            ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60'
                            : 'bg-[#4f9cf9]/15 text-[#4f9cf9] hover:bg-[#4f9cf9]/25'
                        }`}
                        title={s.template_title}
                      >
                        {s.template_title}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
