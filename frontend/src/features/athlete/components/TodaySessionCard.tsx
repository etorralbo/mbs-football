import Link from 'next/link'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

interface Props {
  session: WorkoutSessionSummary
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function TodaySessionCard({ session }: Props) {
  const date = session.scheduled_for ? formatDate(session.scheduled_for) : null

  return (
    <div className="rounded-xl border border-white/8 bg-[#131922] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4f9cf9]">
            Today&apos;s session
          </p>
          <h2 className="mt-1.5 text-xl font-bold text-white">
            {session.template_title}
          </h2>
          {date && (
            <p className="mt-0.5 text-sm text-slate-400">{date}</p>
          )}
        </div>

        <div className="flex-shrink-0 rounded-full bg-[#4f9cf9]/15 p-3">
          <svg
            className="h-6 w-6 text-[#4f9cf9]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
      </div>

      <Link
        href={`/athlete/session/${session.id}`}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-[#c8f135] px-4 py-3 text-sm font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131922]"
      >
        Start workout →
      </Link>
    </div>
  )
}
