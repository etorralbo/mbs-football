'use client'

import { useState } from 'react'
import { Button } from '@/app/_shared/components/Button'
import type { ExecutionItem } from '@/app/_shared/api/types'
import type { AthleteAction, AthleteDraft, AthleteSetDraft } from '@/src/features/athlete/athleteStore'
import { SetTableEditor } from './SetTableEditor'

interface Props {
  item: ExecutionItem
  exerciseSets: AthleteDraft[string]
  exerciseNumber: number
  totalExercises: number
  progressPct: number
  dispatch: (action: AthleteAction) => void
  onLogAndNext: (exerciseId: string) => Promise<void>
  onComplete: (exerciseId: string) => Promise<void>
  onBack: () => void
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
  onLogAndNext,
  onComplete,
  onBack,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Exercise {exerciseNumber} of {totalExercises}
          </span>
          <span>{progressPct}% complete</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-1.5 rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Exercise card */}
      <div className="flex-1 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        {/* Name */}
        <h1 className="text-lg font-semibold text-zinc-900">
          {item.exercise_name}
        </h1>

        {/* Target prescription badge */}
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5">
          <svg
            className="h-3 w-3 text-indigo-500"
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
          <span className="text-xs font-medium text-indigo-700">
            Target: {prescriptionText(item.prescription)}
          </span>
        </div>

        {/* Set table */}
        <div className="mt-5">
          <SetTableEditor
            sets={sortedSets}
            exerciseId={item.exercise_id}
            dispatch={dispatch}
          />
        </div>

        {/* Add set */}
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'ADD_SET', exerciseId: item.exercise_id })
          }
          className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          + Add set
        </button>
      </div>

      {/* Navigation footer */}
      <div className="mt-6 space-y-3 pb-6">
        {error && (
          <p role="alert" className="text-center text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {exerciseNumber > 1 && (
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
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

        <p className="text-center text-xs text-zinc-400">
          Progress is saved automatically when you move to the next exercise
        </p>
      </div>
    </div>
  )
}
