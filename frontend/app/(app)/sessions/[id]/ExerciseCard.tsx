'use client'

import { useState } from 'react'
import { request, ConflictError, ValidationError } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'
import type { ExecutionItem } from '@/app/_shared/api/types'
import type { DraftAction, DraftState } from '@/src/features/session-execution/draftState'
import { SetRow } from './SetRow'

interface Props {
  sessionId: string
  item: ExecutionItem
  exerciseSets: DraftState[string]
  isCompleted: boolean
  dispatch: (action: DraftAction) => void
  onSavingChange?: (exerciseId: string, isSaving: boolean) => void
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

function parseOpt(value: string): number | null {
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

export function ExerciseCard({
  sessionId,
  item,
  exerciseSets,
  isCompleted,
  dispatch,
  onSavingChange,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sortedSets = Object.entries(exerciseSets)
    .map(([k, v]) => ({ setNumber: Number(k), draft: v }))
    .sort((a, b) => a.setNumber - b.setNumber)

  const isAlreadyDone = sortedSets.every((s) => s.draft.done)

  async function handleSave() {
    const validEntries = sortedSets
      .map(({ setNumber, draft }) => ({
        set_number: setNumber,
        reps: parseOpt(draft.reps),
        weight: parseOpt(draft.weight),
        rpe: parseOpt(draft.rpe),
      }))
      .filter((e) => e.reps !== null || e.weight !== null || e.rpe !== null)

    if (validEntries.length === 0) return

    setError(null)
    setSaving(true)
    onSavingChange?.(item.exercise_id, true)

    try {
      await request(`/v1/workout-sessions/${sessionId}/logs`, {
        method: 'PUT',
        body: JSON.stringify({
          exercise_id: item.exercise_id,
          entries: validEntries,
        }),
      })
      dispatch({ type: 'MARK_DONE', exerciseId: item.exercise_id })
    } catch (err) {
      if (err instanceof ConflictError) {
        // Duplicate log — treat as success (idempotent)
        dispatch({ type: 'MARK_DONE', exerciseId: item.exercise_id })
      } else if (err instanceof ValidationError) {
        setError('Some entries are invalid. Check your values and try again.')
      } else {
        setError('Failed to save. Please try again.')
      }
    } finally {
      setSaving(false)
      onSavingChange?.(item.exercise_id, false)
    }
  }

  function handleAddSet() {
    dispatch({ type: 'ADD_SET', exerciseId: item.exercise_id })
  }

  return (
    <div className="rounded-lg border border-white/8 bg-[#131922] p-4">
      {/* Exercise name + prescription */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{item.exercise_name}</p>
          <p className="mt-0.5 text-xs text-slate-400">{prescriptionText(item.prescription)}</p>
        </div>
        {isAlreadyDone && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#c8f135]/15 px-2 py-0.5 text-xs font-semibold text-[#c8f135] ring-1 ring-[#c8f135]/30">
              Done
            </span>
            {!isCompleted && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'UNDO_DONE', exerciseId: item.exercise_id })}
                className="text-xs text-slate-400 hover:text-white"
                aria-label={`Undo ${item.exercise_name}`}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Set rows */}
      <div className="mt-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
          <span className="w-5" />
          <span className="w-20">Reps</span>
          <span className="w-20">Weight (kg)</span>
          <span className="w-20">RPE</span>
        </div>
        <div className="space-y-2">
          {sortedSets.map(({ setNumber, draft }) => (
            <SetRow
              key={setNumber}
              setNumber={setNumber}
              draft={draft}
              disabled={isCompleted}
              onChange={(field, value) =>
                dispatch({
                  type: 'UPDATE_SET',
                  exerciseId: item.exercise_id,
                  setNumber,
                  field,
                  value,
                })
              }
            />
          ))}
        </div>

        {!isCompleted && !isAlreadyDone && (
          <button
            type="button"
            onClick={handleAddSet}
            className="mt-2 text-xs font-medium text-[#4f9cf9] hover:text-[#7ab5fb]"
          >
            + Add set
          </button>
        )}
      </div>

      {/* Save button + error */}
      {!isCompleted && !isAlreadyDone && (
        <div className="mt-3 flex items-center gap-3">
          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
          <Button size="sm" variant="secondary" onClick={handleSave} loading={saving}>
            {saving ? 'Saving…' : 'Save sets'}
          </Button>
        </div>
      )}
    </div>
  )
}
