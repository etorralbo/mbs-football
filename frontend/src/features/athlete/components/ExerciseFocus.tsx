'use client'

import { useState } from 'react'
import { Button } from '@/app/_shared/components/Button'
import type { ExecutionItem } from '@/app/_shared/api/types'
import type {
  AthleteAction,
  AthleteDraft,
  AthleteSetDraft,
  SetStatusMap,
} from '@/src/features/athlete/athleteStore'
import { SetTableEditor } from './SetTableEditor'

interface Props {
  item: ExecutionItem
  exerciseSets: AthleteDraft[string]
  exerciseNumber: number
  totalExercises: number
  progressPct: number
  dispatch: (action: AthleteAction) => void
  setStatuses: SetStatusMap
  onSaveSet: (exerciseId: string, setNumber: number) => void
  onLogAndNext: (exerciseId: string) => Promise<void>
  onComplete: (exerciseId: string) => Promise<void>
  onBack: () => void
  onDiscardDraft?: () => void
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

export function ExerciseFocus({
  item,
  exerciseSets,
  exerciseNumber,
  totalExercises,
  progressPct,
  dispatch,
  setStatuses,
  onSaveSet,
  onLogAndNext,
  onComplete,
  onBack,
  onDiscardDraft,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const isLast = exerciseNumber === totalExercises

  const sortedSets = Object.entries(exerciseSets)
    .map(([k, v]) => ({ setNumber: Number(k), draft: v as AthleteSetDraft }))
    .sort((a, b) => a.setNumber - b.setNumber)

  async function handleNext() {
    setError(null)
    setSaving(true)
    try {
      await onLogAndNext(item.exercise_id)
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
      await onComplete(item.exercise_id)
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
            Exercise {exerciseNumber} of {totalExercises}
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

      {/* Exercise card */}
      <div className="flex-1 rounded-xl border border-white/8 bg-[#131922] p-5">
        {/* Name */}
        <h1 className="text-lg font-semibold text-white">
          {item.exercise_name}
        </h1>

        {/* Target prescription badge */}
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#4f9cf9]/10 px-2.5 py-0.5">
          <svg
            className="h-3 w-3 text-[#4f9cf9]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span className="text-xs font-medium text-[#4f9cf9]">
            Target: {prescriptionText(item.prescription)}
          </span>
        </div>

        {/* Set table */}
        <div className="mt-5">
          <SetTableEditor
            sets={sortedSets}
            exerciseId={item.exercise_id}
            dispatch={dispatch}
            setStatuses={setStatuses}
            onSaveSet={(setNumber) => onSaveSet(item.exercise_id, setNumber)}
          />
        </div>

        {/* Add set */}
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'ADD_SET', exerciseId: item.exercise_id })
          }
          className="mt-3 text-xs font-medium text-[#4f9cf9] hover:text-[#7ab5fb]"
        >
          + Add set
        </button>
      </div>

      {/* Navigation footer */}
      <div className="mt-6 space-y-3 pb-6">
        {error && (
          <p role="alert" className="text-center text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {exerciseNumber > 1 && (
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
              Next exercise →
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
          Progress is saved automatically when you move to the next exercise
        </p>
      </div>
    </div>
  )
}
