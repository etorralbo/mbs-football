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
    <div className="sticky bottom-0 -mx-6 border-t border-white/8 bg-[#0a0d14]/95 px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{completedExercises}</span>
          {' / '}
          {totalExercises} exercises
          {' · '}
          <span className="font-semibold text-white">{completedSets}</span> sets logged
        </p>

        <div className="flex flex-col items-end gap-1">
          {completeError && (
            <p role="alert" className="text-xs text-red-400">
              {completeError}
            </p>
          )}
          {!canComplete && !completing && (
            <p className="text-xs text-slate-500">
              Log at least one set to complete the session
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
