'use client'

import { useEffect, useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { Exercise } from '@/app/_shared/api/types'
import { Badge } from '@/app/_shared/components/Badge'
import { FILTER_CHIPS } from '@/app/(app)/exercises/useExerciseFilters'

// ---------------------------------------------------------------------------
// SessionExercisePicker
//
// Right-side drawer for adding an exercise to a specific block in a session.
// Reuses the same visual pattern as the template ExercisePicker but calls the
// session-level structure endpoint instead of the block-items endpoint.
//
// Clicking an exercise row adds it immediately (single-select, no multi-step).
// The parent is responsible for refreshing execution data on success.
// ---------------------------------------------------------------------------

interface Props {
  sessionId: string
  blockIndex: number
  blockName: string
  onClose: () => void
  onExerciseAdded: () => void
}

export function SessionExercisePicker({
  sessionId,
  blockIndex,
  blockName,
  onClose,
  onExerciseAdded,
}: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    request<Exercise[]>('/v1/exercises')
      .then(setExercises)
      .catch(() => setLoadError('Failed to load exercises.'))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const lowerQuery = query.toLowerCase()
  const filtered = exercises.filter((ex) => {
    const matchesQuery = lowerQuery === '' || ex.name.toLowerCase().includes(lowerQuery)
    const matchesTags = selectedTags.every((t) => ex.tags.includes(t))
    return matchesQuery && matchesTags
  })

  const favorites = filtered.filter((ex) => ex.is_favorite)
  const favoriteIds = new Set(favorites.map((ex) => ex.id))
  const company = filtered.filter((ex) => ex.owner_type === 'COMPANY' && !favoriteIds.has(ex.id))
  const coach = filtered.filter((ex) => ex.owner_type !== 'COMPANY' && !favoriteIds.has(ex.id))

  async function handleAdd(exerciseId: string) {
    setAdding(true)
    setAddError(null)
    try {
      await request(`/v1/workout-sessions/${sessionId}/structure/exercises`, {
        method: 'POST',
        body: JSON.stringify({
          exercise_id: exerciseId,
          block_index: blockIndex,
          sets: [],
        }),
      })
      onExerciseAdded()
    } catch {
      setAddError('Could not add exercise. Please try again.')
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add exercise to ${blockName}`}
        className="relative flex h-full w-full max-w-md min-w-0 animate-[slideIn_200ms_ease-out] flex-col overflow-hidden bg-slate-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">Add exercise</h2>
            <p className="text-xs text-slate-500">{blockName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close exercise picker"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-5 pt-4">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            aria-label="Search exercises"
            className="w-full rounded-md border border-white/10 bg-[#131922] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
          />
        </div>

        {/* Tag chips */}
        <div className="flex min-w-0 shrink-0 gap-2 overflow-x-auto overflow-y-hidden px-5 py-3 scrollbar-none">
          {FILTER_CHIPS.map(({ label, value }) => {
            const active = selectedTags.includes(value)
            return (
              <button
                key={value}
                onClick={() => toggleTag(value)}
                aria-pressed={active}
                className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9cf9]/50 ${
                  active
                    ? 'border-[#4f9cf9] bg-[#4f9cf9]/15 text-[#4f9cf9]'
                    : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Exercise list */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-2">
          {loadError && (
            <p role="alert" className="py-2 text-sm text-red-400">
              {loadError}
            </p>
          )}
          {loadingList && (
            <p className="py-4 text-sm text-slate-500">Loading exercises…</p>
          )}
          {addError && (
            <p role="alert" className="py-1 text-xs text-red-400">
              {addError}
            </p>
          )}
          {!loadingList && !loadError && filtered.length === 0 && (
            <p className="mt-8 text-center text-sm text-slate-500">
              No exercises match your filters.
            </p>
          )}

          {favorites.length > 0 && (
            <section aria-label="Favorites">
              <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Favorites
              </h3>
              <ExerciseRows exercises={favorites} adding={adding} onAdd={handleAdd} />
            </section>
          )}

          {company.length > 0 && (
            <section aria-label="Official exercises">
              <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Official
              </h3>
              <ExerciseRows
                exercises={company}
                adding={adding}
                onAdd={handleAdd}
                showOfficialBadge
              />
            </section>
          )}

          {coach.length > 0 && (
            <section aria-label="My exercises">
              <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                My Exercises
              </h3>
              <ExerciseRows exercises={coach} adding={adding} onAdd={handleAdd} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExerciseRows — single-tap-to-add list
// ---------------------------------------------------------------------------

interface ExerciseRowsProps {
  exercises: Exercise[]
  adding: boolean
  onAdd: (exerciseId: string) => void
  showOfficialBadge?: boolean
}

function ExerciseRows({ exercises, adding, onAdd, showOfficialBadge }: ExerciseRowsProps) {
  return (
    <ul className="space-y-1">
      {exercises.map((ex) => (
        <li key={ex.id}>
          <button
            onClick={() => onAdd(ex.id)}
            disabled={adding}
            aria-label={`Add ${ex.name}`}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-white/5 bg-[#131922] px-3 py-2.5 text-left transition-all hover:border-white/15 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* Plus icon */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-500">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">{ex.name}</span>
                {showOfficialBadge && <Badge variant="info">Official</Badge>}
              </div>
              {ex.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {ex.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/5 px-1.5 py-0.5 text-xs text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
