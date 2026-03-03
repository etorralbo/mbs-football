'use client'

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { Exercise } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  onSelect: (exercise: Exercise) => void
  /** Called when the user wants to create a new exercise by name */
  onCreateRequest?: (name: string) => void
  /** True while parent is saving the selected exercise to the block */
  adding?: boolean
  /** True while parent is creating a new exercise via the API */
  creating?: boolean
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[#4f9cf9]/20 text-[#4f9cf9] not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ---------------------------------------------------------------------------
// ExerciseItem — one row in the dropdown list
// ---------------------------------------------------------------------------

interface ExerciseItemProps {
  exercise: Exercise
  query: string
  isActive: boolean
  /** Flat index in the combined official+mine list — used for keyboard scroll */
  index: number
  onSelect: () => void
}

function ExerciseItem({ exercise, query, isActive, index, onSelect }: ExerciseItemProps) {
  return (
    <li role="option" aria-selected={isActive} id={`exercise-option-${exercise.id}`}>
      <button
        type="button"
        aria-label={exercise.name}
        data-exercise-index={index}
        onClick={onSelect}
        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8 ${
          isActive ? 'bg-white/8' : ''
        }`}
      >
        <span>{highlight(exercise.name, query)}</span>
        {exercise.owner_type === 'COMPANY' && (
          <span className="ml-2 shrink-0 rounded-full bg-[#4f9cf9]/15 px-2 py-0.5 text-xs font-semibold text-[#4f9cf9] ring-1 ring-[#4f9cf9]/30">
            Official
          </span>
        )}
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// ExerciseSelector
// ---------------------------------------------------------------------------

export function ExerciseSelector({
  onSelect,
  onCreateRequest,
  adding = false,
  creating = false,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Fetch all exercises once on mount — no re-fetch on query change
  useEffect(() => {
    request<Exercise[]>('/v1/exercises')
      .then(setAllExercises)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 250 ms debounce: query → debouncedQuery
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  // Reset keyboard cursor when filtered results change
  useEffect(() => {
    setActiveIndex(-1)
  }, [debouncedQuery])

  // Client-side filter, split by owner_type, memoised
  const { official, mine, flatList } = useMemo(() => {
    const q = debouncedQuery.toLowerCase()
    const filtered = q
      ? allExercises.filter((ex) => ex.name.toLowerCase().includes(q))
      : allExercises
    const official = filtered.filter((ex) => ex.owner_type === 'COMPANY')
    const mine = filtered.filter((ex) => ex.owner_type === 'COACH')
    return { official, mine, flatList: [...official, ...mine] }
  }, [allExercises, debouncedQuery])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0) {
      const el = document.querySelector<HTMLElement>(`[data-exercise-index="${activeIndex}"]`)
      el?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIndex])

  function handleSelectExercise(exercise: Exercise) {
    onSelect(exercise)
    setQuery('')
    setDebouncedQuery('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
        break
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, flatList.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && flatList[activeIndex]) {
          handleSelectExercise(flatList[activeIndex])
        }
        break
    }
  }

  const activeId =
    activeIndex >= 0 && flatList[activeIndex]
      ? `exercise-option-${flatList[activeIndex].id}`
      : undefined

  return (
    <div className="relative mt-3">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="exercise-listbox"
        aria-activedescendant={activeId}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled || adding || creating}
        placeholder="Search exercise to add…"
        className="w-full rounded-md border border-dashed border-white/15 bg-[#0d1420] px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none disabled:opacity-50"
      />

      {open && (
        <div
          id="exercise-listbox"
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-white/8 bg-[#131922] shadow-lg shadow-black/40"
        >
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
          ) : flatList.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400">
              {debouncedQuery ? (
                <>
                  <p>No matches for &ldquo;{debouncedQuery}&rdquo;.</p>
                  {onCreateRequest && (
                    <button
                      type="button"
                      onClick={() => {
                        onCreateRequest(debouncedQuery)
                        setQuery('')
                        setDebouncedQuery('')
                        setOpen(false)
                      }}
                      disabled={creating}
                      className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-[#4f9cf9]/30 px-2 py-0.5 text-xs text-[#4f9cf9] transition-colors hover:bg-[#4f9cf9]/10 disabled:opacity-50"
                    >
                      {creating ? 'Creating…' : `+ Create "${debouncedQuery}"`}
                    </button>
                  )}
                </>
              ) : (
                <p>No exercises available.</p>
              )}
            </div>
          ) : (
            <>
              {official.length > 0 && (
                <div>
                  <div
                    className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    aria-hidden="true"
                  >
                    Official Exercises
                  </div>
                  <ul>
                    {official.map((ex, i) => (
                      <ExerciseItem
                        key={ex.id}
                        exercise={ex}
                        query={debouncedQuery}
                        isActive={activeIndex === i}
                        index={i}
                        onSelect={() => handleSelectExercise(ex)}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {mine.length > 0 && (
                <div className={official.length > 0 ? 'border-t border-white/8' : ''}>
                  <div
                    className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    aria-hidden="true"
                  >
                    My Exercises
                  </div>
                  <ul>
                    {mine.map((ex, i) => (
                      <ExerciseItem
                        key={ex.id}
                        exercise={ex}
                        query={debouncedQuery}
                        isActive={activeIndex === official.length + i}
                        index={official.length + i}
                        onSelect={() => handleSelectExercise(ex)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
