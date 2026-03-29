'use client'

import { useState } from 'react'
import { request, ConflictError, ValidationError } from '@/app/_shared/api/httpClient'
import type { ExecutionItem, ExerciseVideo } from '@/app/_shared/api/types'
import { parseOpt } from '@/src/features/session-execution/draftState'
import type { DraftAction, DraftState } from '@/src/features/session-execution/draftState'
import { Badge } from '@/app/_shared/components/Badge'
import { VideoModal } from '@/app/_shared/components/VideoModal'
import { SetRow } from './SetRow'

interface Props {
  sessionId: string
  item: ExecutionItem
  exerciseSets: DraftState[string]
  isCompleted: boolean
  /** When false (coach view): saving does not mark the exercise done and
   *  the toggle icon is hidden. Defaults to true (athlete behaviour). */
  completionEnabled?: boolean
  dispatch: (action: DraftAction) => void
  onSavingChange?: (exerciseId: string, isSaving: boolean) => void
}

function prescriptionText(p: Record<string, unknown>): string {
  const parts: string[] = []

  if (Array.isArray(p.sets)) {
    const count = p.sets.length
    parts.push(`${count} ${count === 1 ? 'set' : 'sets'}`)
    // Extract common values from first set for summary
    const first = p.sets[0] as Record<string, unknown> | undefined
    if (first) {
      if (first.reps) parts.push(`${first.reps} reps`)
      if (first.weight) parts.push(`@ ${first.weight} kg`)
      if (first.rpe) parts.push(`RPE ${first.rpe}`)
    }
  } else {
    // Legacy flat format
    if (p.sets) parts.push(`${p.sets} sets`)
    if (p.reps) parts.push(`${p.reps} reps`)
    if (p.weight) parts.push(`@ ${p.weight} kg`)
    else if (p.load) parts.push(`@ ${p.load}`)
    if (p.rpe) parts.push(`RPE ${p.rpe}`)
  }

  if (p.duration) parts.push(String(p.duration))
  if (p.rest) parts.push(`rest ${p.rest}`)
  return parts.join(' · ') || '—'
}

export function ExerciseCard({
  sessionId,
  item,
  exerciseSets,
  isCompleted,
  completionEnabled = true,
  dispatch,
  onSavingChange,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watchingVideo, setWatchingVideo] = useState<ExerciseVideo | null>(null)

  const sortedSets = Object.entries(exerciseSets)
    .map(([k, v]) => ({ setNumber: Number(k), draft: v }))
    .sort((a, b) => a.setNumber - b.setNumber)

  const isAlreadyDone = sortedSets.every((s) => s.draft.done)

  // Saves all logged entries for this exercise, then dispatches the given action.
  // Includes sets that have data, are already done (must be re-sent because the
  // backend replaces all entries atomically), or are being marked done by this action.
  async function saveThenDispatch(action: DraftAction) {
    const isMarkingAll = action.type === 'MARK_DONE'
    const markingSet = action.type === 'MARK_SET_DONE' ? action.setNumber : null

    const validEntries = sortedSets
      .filter(({ setNumber, draft }) => {
        const hasData = parseOpt(draft.reps) !== null || parseOpt(draft.weight) !== null || parseOpt(draft.rpe) !== null
        return hasData || draft.done || isMarkingAll || setNumber === markingSet
      })
      .map(({ setNumber, draft }) => ({
        set_number: setNumber,
        reps: parseOpt(draft.reps),
        weight: parseOpt(draft.weight),
        rpe: parseOpt(draft.rpe),
      }))

    setError(null)
    setSaving(true)
    onSavingChange?.(item.exercise_id, true)

    try {
      if (validEntries.length > 0) {
        await request(`/v1/workout-sessions/${sessionId}/logs`, {
          method: 'PUT',
          body: JSON.stringify({ exercise_id: item.exercise_id, entries: validEntries }),
        })
      }
      dispatch(action)
    } catch (err) {
      if (err instanceof ConflictError) {
        dispatch(action)
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

  function handleToggleAll() {
    if (isAlreadyDone) {
      dispatch({ type: 'UNDO_DONE', exerciseId: item.exercise_id })
      return
    }
    saveThenDispatch({ type: 'MARK_DONE', exerciseId: item.exercise_id })
  }

  function handleToggleSet(setNumber: number, isDone: boolean) {
    if (isDone) {
      dispatch({ type: 'UNDO_SET_DONE', exerciseId: item.exercise_id, setNumber })
      return
    }
    saveThenDispatch({ type: 'MARK_SET_DONE', exerciseId: item.exercise_id, setNumber })
  }

  return (
    <div className="rounded-lg border border-white/8 bg-[#131922] p-4">
      {watchingVideo && (
        <VideoModal
          video={watchingVideo}
          title={item.exercise_name}
          onClose={() => setWatchingVideo(null)}
        />
      )}

      {/* Exercise name + prescription */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{item.exercise_name}</p>
          <p className="mt-0.5 text-xs text-slate-400">{prescriptionText(item.prescription)}</p>
          {item.video && (
            <button
              type="button"
              onClick={() => setWatchingVideo(item.video!)}
              aria-label={`Watch video demo for ${item.exercise_name}`}
              className="group/chip mt-2 flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5 transition-all hover:border-white/20 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
            >
              <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${item.video.external_id}/mqdefault.jpg`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 transition-colors group-hover/chip:bg-black/30">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="text-white drop-shadow">
                    <path d="M6 4.5l6 3.5-6 3.5V4.5z" />
                  </svg>
                </div>
              </div>
              <span className="text-[11px] text-slate-500 transition-colors group-hover/chip:text-slate-300">
                Watch demo
              </span>
            </button>
          )}
        </div>

        {/* Exercise-level done toggle (athlete) or read-only badge (coach / completed) */}
        {completionEnabled && !isCompleted ? (
          <button
            type="button"
            onClick={handleToggleAll}
            disabled={saving}
            aria-label={isAlreadyDone ? `Undo ${item.exercise_name}` : `Mark ${item.exercise_name} done`}
            className="shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-40"
          >
            {isAlreadyDone ? (
              /* All sets done — solid green check circle */
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-[#c8f135]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
              </svg>
            ) : (
              /* Not all done — outline grey circle */
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <circle cx="12" cy="12" r="9.25" />
              </svg>
            )}
          </button>
        ) : (
          isAlreadyDone && (
            <Badge variant="done">Done</Badge>
          )
        )}
      </div>

      {/* Set rows */}
      <div className="mt-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-2">
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
              readOnly={isCompleted && !completionEnabled}
              completionEnabled={completionEnabled}
              saving={saving}
              onToggleDone={() => handleToggleSet(setNumber, draft.done)}
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

      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
