'use client'

import { useEffect, useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { BlockItem, Exercise } from '@/app/_shared/api/types'
import { FILTER_CHIPS } from '@/app/(app)/exercises/useExerciseFilters'

// ---------------------------------------------------------------------------
// ExercisePicker
//
// Full-screen modal that lets the coach search, filter by tag, and pick an
// exercise to add to a block. Fetches the exercise list once on mount and
// filters entirely client-side for instant feedback.
//
// When the coach clicks an exercise:
//   1. POST /v1/blocks/{blockId}/items → creates the block item
//   2. onSelect(exercise) → parent updates its local state
//   3. onClose() → modal closes
// ---------------------------------------------------------------------------

export interface ExercisePickerProps {
  blockId: string
  onSelect: (exercise: Exercise, item: BlockItem) => void
  onClose: () => void
}

export function ExercisePicker({ blockId, onSelect, onClose }: ExercisePickerProps) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load exercises once on mount
  useEffect(() => {
    request<Exercise[]>('/v1/exercises')
      .then(setExercises)
      .catch(() => setLoadError('Failed to load exercises.'))
      .finally(() => setLoadingList(false))
  }, [])

  // Autofocus search input
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Close on Escape
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

  // Client-side filter
  const lowerQuery = query.toLowerCase()
  const filtered = exercises.filter((ex) => {
    const matchesQuery = lowerQuery === '' || ex.name.toLowerCase().includes(lowerQuery)
    const matchesTags = selectedTags.every((t) => ex.tags.includes(t))
    return matchesQuery && matchesTags
  })

  const favorites = filtered.filter((ex) => ex.is_favorite)
  const favoriteIds = new Set(favorites.map((ex) => ex.id))
  // Exclude favorites from the regular sections to avoid duplicates
  const company = filtered.filter((ex) => ex.owner_type === 'COMPANY' && !favoriteIds.has(ex.id))
  const coach = filtered.filter((ex) => ex.owner_type !== 'COMPANY' && !favoriteIds.has(ex.id))

  async function handleSelect(exercise: Exercise) {
    setAddingId(exercise.id)
    setAddError(null)
    try {
      const item = await request<BlockItem>(`/v1/blocks/${blockId}/items`, {
        method: 'POST',
        body: JSON.stringify({ exercise_id: exercise.id }),
      })
      onSelect(exercise, item)
      onClose()
    } catch {
      setAddError('Could not add exercise. Please try again.')
      setAddingId(null)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0a0f1a]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pick an exercise"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex-1">
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
        <button
          onClick={onClose}
          aria-label="Close exercise picker"
          className="shrink-0 rounded-md p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tag filter chips */}
      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
        {FILTER_CHIPS.map(({ label, value }) => {
          const active = selectedTags.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggleTag(value)}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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

      {/* Error / Loading */}
      {loadError && (
        <p role="alert" className="px-4 py-2 text-sm text-red-400">{loadError}</p>
      )}
      {loadingList && (
        <p className="px-4 py-4 text-sm text-slate-500">Loading exercises…</p>
      )}

      {/* Add error */}
      {addError && (
        <p role="alert" className="px-4 py-1 text-xs text-red-400">{addError}</p>
      )}

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {!loadingList && !loadError && filtered.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-500">
            No exercises match your filters.
          </p>
        )}

        {/* Favorites section */}
        {favorites.length > 0 && (
          <section aria-label="Favorites">
            <h2 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Favorites
            </h2>
            <ExerciseList
              exercises={favorites}
              addingId={addingId}
              onSelect={handleSelect}
            />
          </section>
        )}

        {/* Official (COMPANY) exercises */}
        {company.length > 0 && (
          <section aria-label="Official exercises">
            <h2 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Official
            </h2>
            <ExerciseList
              exercises={company}
              addingId={addingId}
              onSelect={handleSelect}
              showOfficialBadge
            />
          </section>
        )}

        {/* Coach's own exercises */}
        {coach.length > 0 && (
          <section aria-label="My exercises">
            <h2 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              My Exercises
            </h2>
            <ExerciseList
              exercises={coach}
              addingId={addingId}
              onSelect={handleSelect}
            />
          </section>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExerciseList — renders a list of exercise rows
// ---------------------------------------------------------------------------

interface ExerciseListProps {
  exercises: Exercise[]
  addingId: string | null
  onSelect: (exercise: Exercise) => void
  showOfficialBadge?: boolean
}

function ExerciseList({ exercises, addingId, onSelect, showOfficialBadge }: ExerciseListProps) {
  return (
    <ul className="space-y-1">
      {exercises.map((ex) => (
        <li key={ex.id}>
          <button
            onClick={() => onSelect(ex)}
            disabled={addingId !== null}
            aria-label={`Add ${ex.name}`}
            className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-[#131922] px-3 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/5 disabled:opacity-60"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">
                  {addingId === ex.id ? 'Adding…' : ex.name}
                </span>
                {showOfficialBadge && (
                  <span className="shrink-0 rounded-full bg-[#4f9cf9]/15 px-1.5 py-0.5 text-xs font-medium text-[#4f9cf9]">
                    Official
                  </span>
                )}
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  )
}
