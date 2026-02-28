'use client'

import { Button } from '@/app/_shared/components/Button'

interface Props {
  completedExercises: number
  totalExercises: number
  completedSets: number
  canComplete: boolean
  completing: boolean
  completeError: string | null
  onComplete: () => void
}

export function CompletionBar({
  completedExercises,
  totalExercises,
  completedSets,
  canComplete,
  completing,
  completeError,
  onComplete,
}: Props) {
  return (
    <div className="sticky bottom-0 -mx-6 border-t border-zinc-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">
          <span className="font-medium text-zinc-900">{completedExercises}</span>
          {' / '}
          {totalExercises} exercises
          {' · '}
          <span className="font-medium text-zinc-900">{completedSets}</span> sets logged
        </p>

        <div className="flex flex-col items-end gap-1">
          {completeError && (
            <p role="alert" className="text-xs text-red-600">
              {completeError}
            </p>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={!canComplete || completing}
            loading={completing}
            onClick={onComplete}
          >
            {completing ? 'Completing…' : 'Mark as completed'}
          </Button>
        </div>
      </div>
    </div>
  )
}
