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
          className="flex-1 rounded-md border border-dashed border-white/15 bg-[#0d1420] px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
        />
        {searching && (
          <span className="text-xs text-slate-400">Searching…</span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-white/8 bg-[#131922] shadow-lg shadow-black/40">
          {results.map((ex) => (
            <li key={ex.id}>
              <button
                onClick={() => handleAdd(ex)}
                disabled={adding === ex.id}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8 disabled:opacity-50"
              >
                <span>{ex.name}</span>
                {adding === ex.id ? (
                  <span className="text-xs text-slate-400">Adding…</span>
                ) : (
                  <span className="text-xs text-[#4f9cf9]">+ Add</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim() && !searching && results.length === 0 && (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-slate-400">
            No exercises found for &ldquo;{query}&rdquo;.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-[#4f9cf9]/30 px-2 py-0.5 text-xs text-[#4f9cf9] transition-colors hover:bg-[#4f9cf9]/10 disabled:opacity-50"
          >
            {creating ? 'Creating…' : `+ Create "${query.trim()}"`}
          </button>
        </div>
      )}
    </div>
  )
}
