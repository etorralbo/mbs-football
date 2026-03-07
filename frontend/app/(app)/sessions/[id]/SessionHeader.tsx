import { Badge } from '@/app/_shared/components/Badge'

interface Props {
  title: string
  status: 'pending' | 'completed' | string
  scheduledFor: string | null
  completedExercises: number
  totalExercises: number
  completedSets: number
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function SessionHeader({
  title,
  status,
  scheduledFor,
  completedExercises,
  totalExercises,
  completedSets,
}: Props) {
  const isCompleted = status === 'completed'

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Badge variant={isCompleted ? 'completed' : 'pending'}>
          {isCompleted ? 'Completed' : 'Pending'}
        </Badge>

        {scheduledFor && (
          <span className="text-sm text-slate-400">{formatDate(scheduledFor)}</span>
        )}

        <span className="text-sm text-slate-400" aria-label="Session progress">
          {completedExercises} / {totalExercises} exercises · {completedSets} sets done
        </span>
      </div>
    </div>
  )
}
