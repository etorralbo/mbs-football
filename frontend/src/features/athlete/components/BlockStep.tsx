'use client'

import { useState } from 'react'
import { Button } from '@/app/_shared/components/Button'
import type { SessionExecutionBlock } from '@/app/_shared/api/types'
import type {
  AthleteAction,
  AthleteDraft,
  SetStatusMap,
} from '@/src/features/athlete/athleteStore'
import { ExerciseCard } from './ExerciseCard'

interface Props {
  block: SessionExecutionBlock
  blockNumber: number
  totalBlocks: number
  progressPct: number
  draft: AthleteDraft
  dispatch: (action: AthleteAction) => void
  setStatuses: SetStatusMap
  onSaveSet: (exerciseId: string, setNumber: number) => void
  onBlockNext: (blockKey: string) => Promise<void>
  onComplete: () => Promise<void>
  onBack: () => void
  onDiscardDraft?: () => void
}

export function BlockStep({
  block,
  blockNumber,
  totalBlocks,
  progressPct,
  draft,
  dispatch,
  setStatuses,
  onSaveSet,
  onBlockNext,
  onComplete,
  onBack,
  onDiscardDraft,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const isLast = blockNumber === totalBlocks

  async function handleNext() {
    setError(null)
    setSaving(true)
    try {
      await onBlockNext(block.key)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    setError(null)
    setSaving(true)
    try {
      await onComplete()
    } catch {
      setError('Failed to complete session. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
          <span>
            Block {blockNumber} of {totalBlocks}
          </span>
          <span>{progressPct}% complete</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-1.5 rounded-full bg-[#4f9cf9] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Block header */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-white">{block.name}</h2>
          <span className="text-xs text-slate-400">
            {block.items.length} {block.items.length === 1 ? 'exercise' : 'exercises'}
          </span>
        </div>
        <div className="mt-1 h-px bg-white/8" />
      </div>

      {/* Exercise cards */}
      <div className="flex flex-1 flex-col gap-4">
        {block.items.map((item, idx) => (
          <ExerciseCard
            key={item.exercise_id}
            item={item}
            exerciseSets={draft[item.exercise_id] ?? { 1: { actualReps: '', actualLoad: '', actualRpe: '', note: '', done: false } }}
            exerciseIndex={idx + 1}
            dispatch={dispatch}
            setStatuses={setStatuses}
            onSaveSet={onSaveSet}
          />
        ))}
      </div>

      {/* Navigation footer */}
      <div className="mt-6 space-y-3 pb-6">
        {error && (
          <p role="alert" className="text-center text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {blockNumber > 1 && (
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Back
            </button>
          )}

          {isLast ? (
            <Button
              size="md"
              variant="primary"
              onClick={handleComplete}
              loading={saving}
              className="flex-1 py-3"
            >
              Complete session
            </Button>
          ) : (
            <Button
              size="md"
              variant="primary"
              onClick={handleNext}
              loading={saving}
              className="flex-1 py-3"
            >
              Next block →
            </Button>
          )}
        </div>

        {onDiscardDraft && (
          <div className="flex justify-center">
            {confirmingDiscard ? (
              <span className="flex items-center gap-2 text-xs text-slate-400">
                Reset all edits?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDiscard(false)
                    onDiscardDraft()
                  }}
                  className="font-medium text-red-400 hover:text-red-300"
                >
                  Yes, discard
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDiscard(false)}
                  className="font-medium text-slate-400 hover:text-slate-300"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDiscard(true)}
                className="text-xs text-slate-500 hover:text-slate-400"
              >
                Discard draft
              </button>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-500">
          Progress is saved automatically when you move to the next block
        </p>
      </div>
    </div>
  )
}
