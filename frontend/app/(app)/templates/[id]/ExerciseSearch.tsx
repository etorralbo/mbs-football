'use client'

import { useEffect, useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { Exercise } from '@/app/_shared/api/types'

interface Props {
  blockId: string
  onItemAdded: (item: AddedItem) => void
}

export interface AddedItem {
  id: string
  workout_block_id: string
  order: number
  prescription_json: Record<string, unknown>
  exercise: Exercise
}

export function ExerciseSearch({ blockId, onItemAdded }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Exercise[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null) // exercise_id being added
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await request<Exercise[]>(
          `/v1/exercises?search=${encodeURIComponent(trimmed)}`,
        )
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [query])

  async function handleAdd(exercise: Exercise) {
    setAdding(exercise.id)
    setError(null)
    try {
      const item = await request<AddedItem>(`/v1/blocks/${blockId}/items`, {
        method: 'POST',
        body: JSON.stringify({ exercise_id: exercise.id, prescription_json: {} }),
      })
      onItemAdded(item)
      setQuery('')
      setResults([])
    } catch {
      setError('Could not add exercise. Please try again.')
    } finally {
      setAdding(null)
    }
  }

  async function handleCreate() {
    const name = query.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      // Create the exercise in the team library
      const exercise = await request<Exercise>('/v1/exercises', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      // Then immediately add it to the block
      const item = await request<AddedItem>(`/v1/blocks/${blockId}/items`, {
        method: 'POST',
        body: JSON.stringify({ exercise_id: exercise.id, prescription_json: {} }),
      })
      onItemAdded(item)
      setQuery('')
      setResults([])
    } catch {
      setError('Could not create exercise. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative mt-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercise to add…"
          className="flex-1 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none"
        />
        {searching && (
          <span className="text-xs text-zinc-400">Searching…</span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-md">
          {results.map((ex) => (
            <li key={ex.id}>
              <button
                onClick={() => handleAdd(ex)}
                disabled={adding === ex.id}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <span>{ex.name}</span>
                {adding === ex.id ? (
                  <span className="text-xs text-zinc-400">Adding…</span>
                ) : (
                  <span className="text-xs text-indigo-600">+ Add</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim() && !searching && results.length === 0 && (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-zinc-400">
            No exercises found for &ldquo;{query}&rdquo;.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-indigo-300 px-2 py-0.5 text-xs text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50"
          >
            {creating ? 'Creating…' : `+ Create "${query.trim()}"`}
          </button>
        </div>
      )}
    </div>
  )
}
