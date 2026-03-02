import type { SessionExecution } from '@/app/_shared/api/types'

interface Props {
  execution: SessionExecution
  onStart: () => void
}

function prescriptionText(p: Record<string, unknown>): string {
  const parts: string[] = []
  if (p.sets) parts.push(`${p.sets} sets`)
  if (p.reps) parts.push(`${p.reps} reps`)
  if (p.load) parts.push(`@ ${p.load}`)
  if (p.duration) parts.push(String(p.duration))
  if (p.rest) parts.push(`rest ${p.rest}`)
  return parts.join(' · ') || '—'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function SessionOverview({ execution, onStart }: Props) {
  const totalExercises = execution.blocks.reduce(
    (acc, b) => acc + b.items.length,
    0,
  )
  const isCompleted = execution.status === 'completed'

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            {execution.template_title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span>{totalExercises} exercises</span>
            {execution.scheduled_for && (
              <span>· {formatDate(execution.scheduled_for)}</span>
            )}
          </div>
        </div>

        {isCompleted && (
          <span className="flex-shrink-0 rounded-full bg-emerald-900/30 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-800/50">
            Completed
          </span>
        )}
      </div>

      {/* Exercise list per block */}
      <div className="mt-6 space-y-6">
        {execution.blocks.map((block) => (
          <div key={block.key}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {block.name}
            </h2>
            <ul className="mt-2 space-y-2">
              {block.items.map((item, idx) => (
                <li
                  key={item.exercise_id}
                  className="flex items-center gap-3 rounded-lg border border-white/8 bg-[#131922] px-4 py-3"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/8 text-xs font-medium text-slate-400">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {item.exercise_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {prescriptionText(item.prescription)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* CTA */}
      {!isCompleted && (
        <div className="mt-8 pb-6">
          <button
            type="button"
            onClick={onStart}
            className="w-full rounded-lg bg-[#c8f135] px-4 py-3 text-sm font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2"
          >
            Start workout
          </button>
        </div>
      )}
    </div>
  )
}
