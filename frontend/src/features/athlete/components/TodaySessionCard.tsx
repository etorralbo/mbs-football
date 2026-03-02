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
    <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
            Today's session
          </p>
          <h2 className="mt-1.5 text-xl font-bold text-zinc-900">
            {session.template_title}
          </h2>
          {date && (
            <p className="mt-0.5 text-sm text-zinc-500">{date}</p>
          )}
        </div>

        <div className="flex-shrink-0 rounded-full bg-indigo-50 p-3">
          <svg
            className="h-6 w-6 text-indigo-600"
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
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
      >
        Start workout
      </Link>
    </div>
  )
}
