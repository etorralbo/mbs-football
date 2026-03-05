'use client'

/**
 * Exercise Library page — redesigned for Mettle Performance SaaS.
 *
 * Architecture:
 *  - useExerciseFilters: filter state (query + tags) ↔ URL params
 *  - Client-side filtering: full list fetched once, filtered in memory
 *    (avoids debounce round-trips for a typical library of ~200 exercises)
 *  - Filter chip counts: computed from the full list, memoised
 *  - Favourites: section at the top (server-persisted, optimistic UI)
 *  - Unified list: no OFFICIAL/MY sections — "Official" badge inline
 *  - ExerciseForm: multi-field form (name + description + tags)
 *  - ExerciseCard: hover quick-actions (favourite, edit, duplicate, delete)
 *  - Delete confirmation: inline modal (no window.confirm)
 *  - No dangerouslySetInnerHTML — XSS safe by default
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useAuth } from '@/src/shared/auth/AuthContext'
import type { Exercise } from '@/app/_shared/api/types'

import { CreateButton } from '@/app/_shared/components/CreateButton'
import { PageHeader } from '@/app/_shared/components/PageHeader'
import ExerciseForm, { type ExerciseFormValues } from './ExerciseForm'
import ExerciseCard from './ExerciseCard'
import { FILTER_CHIPS, useExerciseFilters, type Scope } from './useExerciseFilters'

const SCOPE_OPTIONS: { label: string; value: Scope }[] = [
  { label: 'All', value: 'all' },
  { label: 'Official', value: 'official' },
  { label: 'Mine', value: 'mine' },
]

// ---------------------------------------------------------------------------
// Normalise helper (mirrors ExerciseSelector normalisation for search)
// ---------------------------------------------------------------------------
function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------
function ConfirmDeleteModal({
  exercise,
  onConfirm,
  onCancel,
}: {
  exercise: Exercise
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape key
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // Focus the first focusable element (Cancel is safest default)
    const focusable = dialog.querySelectorAll<HTMLElement>('button, [tabindex]')
    if (focusable.length > 0) focusable[focusable.length - 1].focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab' || !dialog) return
      const els = dialog.querySelectorAll<HTMLElement>('button, [tabindex]')
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div ref={dialogRef} className="w-full max-w-sm rounded-xl border border-white/10 bg-[#131922] p-6 shadow-2xl">
        <h2 id="delete-modal-title" className="text-sm font-semibold text-white">
          Delete exercise?
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          <strong className="text-white">{exercise.name}</strong> will be permanently deleted.
          This cannot be undone.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 rounded-md bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/30 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition-all ${
        type === 'success'
          ? 'bg-[#c8f135] text-[#0a0d14]'
          : 'bg-red-500/20 text-red-300 border border-red-500/30'
      }`}
    >
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExercisesPage() {
  const router = useRouter()
  const { role, loading: authLoading } = useAuth()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create / edit form
  const [showForm, setShowForm] = useState(false)
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete modal
  const [deletingExercise, setDeletingExercise] = useState<Exercise | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filters (URL-synced)
  const { filters, setQuery, toggleTag, setScope, clearFilters, hasActiveFilters } = useExerciseFilters()

  // UX guard: athletes should not access this page
  useEffect(() => {
    if (!authLoading && role === 'ATHLETE') router.replace('/sessions')
  }, [authLoading, role, router])

  useEffect(() => {
    document.title = 'Exercise Library | Mettle Performance'
  }, [])

  // ---------------------------------------------------------------------------
  // Data fetching — load full list once; filtering is client-side
  // ---------------------------------------------------------------------------
  function fetchExercises() {
    setLoading(true)
    setError(null)
    request<Exercise[]>('/v1/exercises')
      .then(setExercises)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setError('Failed to load exercises. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------
  function showToast(message: string, type: 'success' | 'error') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // ---------------------------------------------------------------------------
  // Client-side filtering (memoised)
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    let list = exercises

    if (filters.scope === 'official') {
      list = list.filter((e) => e.owner_type === 'COMPANY')
    } else if (filters.scope === 'mine') {
      list = list.filter((e) => e.owner_type === 'COACH')
    }

    if (filters.query) {
      const q = normalise(filters.query)
      list = list.filter((e) => normalise(e.name).includes(q))
    }

    if (filters.tags.length > 0) {
      list = list.filter((e) =>
        filters.tags.every((tag) => e.tags.includes(tag))
      )
    }

    return list
  }, [exercises, filters])

  // Favourites section (from filtered list, sorted by name)
  const favorites = useMemo(
    () => filtered.filter((e) => e.is_favorite),
    [filtered],
  )

  // All exercises (filtered, regardless of favorite)
  const allFiltered = filtered

  // Tag counts from full list (not filtered — so chips show total availability)
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const ex of exercises) {
      for (const tag of ex.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1
      }
    }
    return counts
  }, [exercises])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleFormSubmit(values: ExerciseFormValues) {
    setFormSubmitting(true)
    setFormError(null)
    try {
      if (editingExercise) {
        // Edit
        const updated = await request<Exercise>(`/v1/exercises/${editingExercise.id}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        })
        setExercises((prev) => prev.map((e) => e.id === updated.id ? updated : e))
        showToast('Exercise updated', 'success')
      } else {
        // Create
        const created = await request<Exercise>('/v1/exercises', {
          method: 'POST',
          body: JSON.stringify(values),
        })
        setExercises((prev) => [created, ...prev])
        showToast('Exercise created', 'success')
      }
      setShowForm(false)
      setEditingExercise(null)
    } catch {
      setFormError('Could not save exercise. The name may already exist.')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleFavoriteToggle = useCallback(async (id: string) => {
    // Optimistic UI — flip immediately, revert on error
    setExercises((prev) =>
      prev.map((e) => e.id === id ? { ...e, is_favorite: !e.is_favorite } : e)
    )
    try {
      await request<{ is_favorite: boolean }>(`/v1/exercises/${id}/favorite`, { method: 'POST' })
    } catch {
      // Revert on error
      setExercises((prev) =>
        prev.map((e) => e.id === id ? { ...e, is_favorite: !e.is_favorite } : e)
      )
      showToast('Could not update favourite', 'error')
    }
  }, [])

  function handleEdit(exercise: Exercise) {
    setEditingExercise(exercise)
    setShowForm(true)
    setFormError(null)
  }

  async function handleDuplicate(exercise: Exercise) {
    try {
      const copy = await request<Exercise>('/v1/exercises', {
        method: 'POST',
        body: JSON.stringify({
          name: `${exercise.name} (copy)`.slice(0, 80),
          description: exercise.description,
          tags: exercise.tags,
        }),
      })
      setExercises((prev) => [copy, ...prev])
      showToast('Exercise duplicated', 'success')
    } catch {
      showToast('Could not duplicate exercise', 'error')
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingExercise) return
    const id = deletingExercise.id
    setDeletingExercise(null)
    try {
      await request(`/v1/exercises/${id}`, { method: 'DELETE' })
      setExercises((prev) => prev.filter((e) => e.id !== id))
      showToast('Exercise deleted', 'success')
    } catch {
      showToast('Could not delete exercise. It may be in use.', 'error')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (authLoading) return null

  const formInitial = editingExercise
    ? { name: editingExercise.name, description: editingExercise.description, tags: editingExercise.tags }
    : undefined

  return (
    <>
      <PageHeader
        title="Exercise Library"
        actions={
          <CreateButton onClick={() => { setShowForm((v) => !v); setEditingExercise(null); setFormError(null) }}>
            New exercise
          </CreateButton>
        }
      />

      {/* Create / Edit form */}
      {showForm && (
        <div className="mt-4 rounded-lg border border-white/8 bg-[#131922] p-4">
          <p className="mb-3 text-sm font-medium text-white">
            {editingExercise ? `Edit: ${editingExercise.name}` : 'New exercise'}
          </p>
          <ExerciseForm
            initial={formInitial}
            onSubmit={handleFormSubmit}
            onCancel={() => { setShowForm(false); setEditingExercise(null) }}
            submitting={formSubmitting}
            submitError={formError}
          />
        </div>
      )}

      {/* Scope selector */}
      <div className="mt-4 flex gap-1">
        {SCOPE_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.scope === value}
            onClick={() => setScope(value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filters.scope === value
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mt-3">
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-md border border-white/10 bg-[#131922] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
        />
      </div>

      {/* Filter chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTER_CHIPS.map(({ label, value }) => {
          const active = filters.tags.includes(value)
          const count = tagCounts[value] ?? 0
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggleTag(value)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ${
                active
                  ? 'border-[#c8f135] bg-[#c8f135]/10 text-[#c8f135]'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 ${active ? 'text-[#c8f135]/70' : 'text-slate-600'}`}>
                  ({count})
                </span>
              )}
            </button>
          )
        })}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-500 hover:border-white/20 hover:text-slate-400 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Load error */}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-4" aria-busy="true">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={6} />
        </div>
      )}

      {/* Empty state — no exercises at all */}
      {!loading && exercises.length === 0 && !error && (
        <div className="mt-6 rounded-lg border border-dashed border-white/10 p-10 text-center">
          <p className="text-sm text-slate-500">Your library is empty. Create the first exercise.</p>
        </div>
      )}

      {/* Empty state — filters active, no results */}
      {!loading && exercises.length > 0 && allFiltered.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-white/10 p-10 text-center">
          <p className="text-sm text-slate-500">No exercises match your filters.</p>
          <button
            onClick={clearFilters}
            className="mt-2 text-xs text-[#4f9cf9] hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Exercise list */}
      {!loading && allFiltered.length > 0 && (
        <div className="mt-4 space-y-6">
          {/* Favourites section */}
          {favorites.length > 0 && (
            <section aria-label="Favourites">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Favourites
              </h2>
              <ul className="space-y-1.5">
                {favorites.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    onFavoriteToggle={handleFavoriteToggle}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={setDeletingExercise}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* All exercises */}
          <section aria-label="All exercises">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              All Exercises
              <span className="ml-2 font-normal text-slate-600">({allFiltered.length})</span>
            </h2>
            <ul className="space-y-1.5">
              {allFiltered.map((ex) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  onFavoriteToggle={handleFavoriteToggle}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={setDeletingExercise}
                />
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingExercise && (
        <ConfirmDeleteModal
          exercise={deletingExercise}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingExercise(null)}
        />
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </>
  )
}
