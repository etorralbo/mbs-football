'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useAuth } from '@/src/shared/auth/AuthContext'
import type { Exercise } from '@/app/_shared/api/types'

export default function ExercisesPage() {
  const router = useRouter()
  const { role, loading: authLoading } = useAuth()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // UX guard: athletes should not access this page
  useEffect(() => {
    if (!authLoading && role === 'ATHLETE') router.replace('/sessions')
  }, [authLoading, role, router])

  useEffect(() => {
    document.title = 'Exercise Library | Mettle Performance'
  }, [])

  function fetchExercises(search?: string) {
    setLoading(true)
    setError(null)
    const url = search ? `/v1/exercises?search=${encodeURIComponent(search)}` : '/v1/exercises'
    request<Exercise[]>(url)
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

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchExercises(value.trim() || undefined), 300)
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      setCreateError('Name is required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const created = await request<Exercise>('/v1/exercises', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setExercises((prev) => [created, ...prev])
      setNewName('')
      setShowCreateForm(false)
    } catch {
      setCreateError('Could not create exercise. The name may already exist.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await request(`/v1/exercises/${id}`, { method: 'DELETE' })
      setExercises((prev) => prev.filter((e) => e.id !== id))
    } catch {
      setError('Could not delete exercise. It may be in use by a template.')
    }
  }

  if (authLoading) return null

  // owner_type may be absent on databases that haven't run the migration yet —
  // treat any non-COMPANY exercise (including undefined) as a COACH exercise.
  const companyExercises = exercises.filter((e) => e.owner_type === 'COMPANY')
  const coachExercises = exercises.filter((e) => e.owner_type !== 'COMPANY')

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Exercise Library</h1>
        <button
          onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); setNewName('') }}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New exercise
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="mt-4 rounded-lg border border-white/8 bg-[#131922] p-4">
          <p className="text-sm font-medium text-white">New exercise</p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              maxLength={255}
              placeholder="Exercise name"
              className="flex-1 rounded-md border border-white/10 bg-[#0d1420] px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] hover:bg-[#d4f755] disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
          {createError && (
            <p role="alert" className="mt-2 text-xs text-red-400">{createError}</p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mt-4">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-md border border-white/10 bg-[#131922] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>
      )}

      {loading && (
        <div className="mt-4">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={5} />
        </div>
      )}

      {!loading && exercises.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-white/10 p-8 text-center">
          <p className="text-sm text-slate-500">
            {query ? `No exercises match "${query}".` : 'No exercises yet. Create the first one.'}
          </p>
        </div>
      )}

      {!loading && exercises.length > 0 && (
        <div className="mt-4 space-y-6">
          {/* Official Exercises (COMPANY) */}
          {companyExercises.length > 0 && (
            <section aria-label="Official Exercises">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Official Exercises
              </h2>
              <ul className="space-y-1.5">
                {companyExercises.map((ex) => (
                  <ExerciseRow key={ex.id} exercise={ex} onDelete={handleDelete} />
                ))}
              </ul>
            </section>
          )}

          {/* My Exercises (COACH) */}
          {coachExercises.length > 0 && (
            <section aria-label="My Exercises">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                My Exercises
              </h2>
              <ul className="space-y-1.5">
                {coachExercises.map((ex) => (
                  <ExerciseRow key={ex.id} exercise={ex} onDelete={handleDelete} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-component — isolated to keep the page component readable
// ---------------------------------------------------------------------------

function ExerciseRow({
  exercise,
  onDelete,
}: {
  exercise: Exercise
  onDelete: (id: string, name: string) => void
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] px-4 py-3">
      <div className="min-w-0 flex items-center gap-2">
        {exercise.is_editable === false && (
          <span className="shrink-0 rounded-full bg-[#4f9cf9]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#4f9cf9] ring-1 ring-[#4f9cf9]/30">
            Official
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{exercise.name}</p>
          {exercise.tags && (
            <p className="mt-0.5 text-xs text-slate-500">{exercise.tags}</p>
          )}
        </div>
      </div>

      {exercise.is_editable !== false && (
        <button
          onClick={() => onDelete(exercise.id, exercise.name)}
          aria-label={`Delete ${exercise.name}`}
          className="ml-4 shrink-0 rounded p-1.5 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </li>
  )
}
