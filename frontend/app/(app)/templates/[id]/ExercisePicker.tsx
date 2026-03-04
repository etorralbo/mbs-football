'use client'

import { useEffect, useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { BlockItem, Exercise } from '@/app/_shared/api/types'
import { FILTER_CHIPS } from '@/app/(app)/exercises/useExerciseFilters'

// ---------------------------------------------------------------------------
// ExercisePicker
//
// Right-side drawer that lets the coach search, filter by tag, and pick
// exercises to add to a block. Supports multi-select with a sticky footer.
//
// Mounted only when the drawer is open (parent controls via conditional
// rendering). Fetches the exercise list on mount and filters client-side.
// ---------------------------------------------------------------------------

export interface ExercisePickerProps {
  blockId: string
  onClose: () => void
  onExercisesAdded: (blockId: string, items: BlockItem[]) => void
}

export function ExercisePicker({ blockId, onClose, onExercisesAdded }: ExercisePickerProps) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Fetch exercises on mount
  useEffect(() => {
    request<Exercise[]>('/v1/exercises')
      .then(setExercises)
      .catch(() => setLoadError('Failed to load exercises.'))
      .finally(() => setLoadingList(false))
  }, [])

  // Autofocus search input after drawer animation starts
  useEffect(() => {
    const id = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(id)
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

  function toggleExercise(exerciseId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(exerciseId)) next.delete(exerciseId)
      else next.add(exerciseId)
      return next
    })
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
  const company = filtered.filter((ex) => ex.owner_type === 'COMPANY' && !favoriteIds.has(ex.id))
  const coach = filtered.filter((ex) => ex.owner_type !== 'COMPANY' && !favoriteIds.has(ex.id))

  async function handleAddSelected() {
    if (selectedIds.size === 0) return
    setAdding(true)
    setAddError(null)

    const items: BlockItem[] = []
    const ids = Array.from(selectedIds)

    for (const exerciseId of ids) {
      try {
        const item = await request<BlockItem>(`/v1/blocks/${blockId}/items`, {
          method: 'POST',
          body: JSON.stringify({ exercise_id: exerciseId }),
        })
        items.push(item)
      } catch {
        // Keep successfully added items, report the failure
        const remaining = ids.length - items.length
        setAddError(`Could not add ${remaining} exercise(s). The rest were added successfully.`)
        break
      }
    }

    if (items.length > 0) {
      onExercisesAdded(blockId, items)
    }

    setAdding(false)
    if (!addError && items.length === ids.length) {
      onClose()
    }
  }

  const selectionCount = selectedIds.size

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Browse exercise library"
        className="relative flex w-full max-w-md animate-[slideIn_200ms_ease-out] flex-col bg-slate-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-bold text-white">Browse library</h2>
          <button
            onClick={onClose}
            aria-label="Close exercise picker"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

        {/* Tag filter chips */}
        <div className="flex shrink-0 gap-2 overflow-x-auto px-5 py-3 scrollbar-none">
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
          <p role="alert" className="px-5 py-2 text-sm text-red-400">{loadError}</p>
        )}
        {loadingList && (
          <p className="px-5 py-4 text-sm text-slate-500">Loading exercises…</p>
        )}

        {/* Add error */}
        {addError && (
          <p role="alert" className="px-5 py-1 text-xs text-red-400">{addError}</p>
        )}

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {!loadingList && !loadError && filtered.length === 0 && (
            <p className="mt-8 text-center text-sm text-slate-500">
              No exercises match your filters.
            </p>
          )}

          {/* Favorites section */}
          {favorites.length > 0 && (
            <section aria-label="Favorites">
              <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Favorites
              </h3>
              <ExerciseList
                exercises={favorites}
                selectedIds={selectedIds}
                onToggle={toggleExercise}
                disabled={adding}
              />
            </section>
          )}

          {/* Official (COMPANY) exercises */}
          {company.length > 0 && (
            <section aria-label="Official exercises">
              <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Official
              </h3>
              <ExerciseList
                exercises={company}
                selectedIds={selectedIds}
                onToggle={toggleExercise}
                disabled={adding}
                showOfficialBadge
              />
            </section>
          )}

          {/* Coach's own exercises */}
          {coach.length > 0 && (
            <section aria-label="My exercises">
              <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                My Exercises
              </h3>
              <ExerciseList
                exercises={coach}
                selectedIds={selectedIds}
                onToggle={toggleExercise}
                disabled={adding}
              />
            </section>
          )}
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-slate-800 px-5 py-4">
          <button
            onClick={handleAddSelected}
            disabled={selectionCount === 0 || adding}
            className="w-full rounded-lg bg-[#c8f135] px-4 py-2.5 text-sm font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding
              ? 'Adding…'
              : selectionCount === 0
                ? 'Select exercises'
                : `Add ${selectionCount} exercise${selectionCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExerciseList — renders a list of exercise rows with selection checkboxes
// ---------------------------------------------------------------------------

interface ExerciseListProps {
  exercises: Exercise[]
  selectedIds: Set<string>
  onToggle: (exerciseId: string) => void
  disabled: boolean
  showOfficialBadge?: boolean
}

function ExerciseList({ exercises, selectedIds, onToggle, disabled, showOfficialBadge }: ExerciseListProps) {
  return (
    <ul className="space-y-1">
      {exercises.map((ex) => {
        const selected = selectedIds.has(ex.id)
        return (
          <li key={ex.id}>
            <button
              onClick={() => onToggle(ex.id)}
              disabled={disabled}
              aria-label={`${selected ? 'Deselect' : 'Select'} ${ex.name}`}
              aria-pressed={selected}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                selected
                  ? 'border-[#c8f135]/40 bg-[#c8f135]/10'
                  : 'border-white/5 bg-[#131922] hover:border-white/15 hover:bg-white/5'
              }`}
            >
              {/* Checkbox indicator */}
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  selected
                    ? 'border-[#c8f135] bg-[#c8f135]'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {selected && (
                  <svg className="h-3 w-3 text-[#0a0d14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">
                    {ex.name}
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
            </button>
          </li>
        )
      })}
    </ul>
  )
}
