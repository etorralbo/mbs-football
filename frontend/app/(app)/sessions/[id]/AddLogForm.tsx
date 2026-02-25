'use client'

import { useState } from 'react'
import { request, ValidationError } from '@/app/_shared/api/httpClient'
import { BLOCK_NAMES } from '@/app/_shared/api/types'

interface EntryRow {
  reps: string
  weight: string
  rpe: string
}

interface Props {
  sessionId: string
  onSuccess: () => void
}

const MAX_ENTRIES = 10

function parseOpt(value: string): number | null {
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

export function AddLogForm({ sessionId, onSuccess }: Props) {
  const [blockName, setBlockName] = useState<string>(BLOCK_NAMES[0])
  const [exerciseId, setExerciseId] = useState('')
  const [entries, setEntries] = useState<EntryRow[]>([{ reps: '', weight: '', rpe: '' }])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addEntry() {
    if (entries.length >= MAX_ENTRIES) return
    setEntries((prev) => [...prev, { reps: '', weight: '', rpe: '' }])
  }

  function removeEntry(index: number) {
    if (entries.length <= 1) return
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  function updateEntry(index: number, field: keyof EntryRow, value: string) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedId = exerciseId.trim()
    if (!trimmedId) return

    setError(null)
    setLoading(true)

    try {
      await request(`/v1/workout-sessions/${sessionId}/logs`, {
        method: 'POST',
        body: JSON.stringify({
          block_name: blockName,
          exercise_id: trimmedId,
          entries: entries.map((row, i) => ({
            set_number: i + 1,
            reps: parseOpt(row.reps),
            weight: parseOpt(row.weight),
            rpe: parseOpt(row.rpe),
          })),
          notes: notes.trim() || null,
        }),
      })
      // Reset form
      setBlockName(BLOCK_NAMES[0])
      setExerciseId('')
      setEntries([{ reps: '', weight: '', rpe: '' }])
      setNotes('')
      onSuccess()
    } catch (err) {
      if (err instanceof ValidationError) {
        setError(
          typeof err.detail === 'string'
            ? err.detail
            : 'Validation error. Check your inputs.',
        )
      } else {
        setError('Failed to save log. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      {/* Block name */}
      <div>
        <label htmlFor="log-block" className="block text-sm font-medium text-gray-700">
          Block
        </label>
        <select
          id="log-block"
          value={blockName}
          onChange={(e) => setBlockName(e.target.value)}
          className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {BLOCK_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Exercise ID */}
      <div>
        <label htmlFor="log-exercise-id" className="block text-sm font-medium text-gray-700">
          Exercise ID
        </label>
        <input
          id="log-exercise-id"
          type="text"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          placeholder="Paste exercise UUID"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Sets */}
      <div>
        <p className="text-sm font-medium text-gray-700">Sets</p>
        <div className="mt-2 space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-sm text-gray-500">{i + 1}</span>
              <input
                type="number"
                value={entry.reps}
                onChange={(e) => updateEntry(i, 'reps', e.target.value)}
                placeholder="Reps"
                min={0}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                aria-label={`Set ${i + 1} reps`}
              />
              <input
                type="number"
                value={entry.weight}
                onChange={(e) => updateEntry(i, 'weight', e.target.value)}
                placeholder="kg"
                min={0}
                step={0.5}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                aria-label={`Set ${i + 1} weight`}
              />
              <input
                type="number"
                value={entry.rpe}
                onChange={(e) => updateEntry(i, 'rpe', e.target.value)}
                placeholder="RPE"
                min={1}
                max={10}
                step={0.5}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                aria-label={`Set ${i + 1} RPE`}
              />
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  aria-label={`Remove set ${i + 1}`}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {entries.length < MAX_ENTRIES && (
          <button
            type="button"
            onClick={addEntry}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            + Add set
          </button>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="log-notes" className="block text-sm font-medium text-gray-700">
          Notes
        </label>
        <textarea
          id="log-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional notes"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!exerciseId.trim() || loading}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save log'}
      </button>
    </form>
  )
}
