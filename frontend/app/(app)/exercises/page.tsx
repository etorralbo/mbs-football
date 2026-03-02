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

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Exercise Library</h1>
        <button
          onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); setNewName('') }}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New exercise
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-700">New exercise</p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              maxLength={255}
              placeholder="Exercise name"
              className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
          {createError && (
            <p role="alert" className="mt-2 text-xs text-red-600">{createError}</p>
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
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>
      )}

      {loading && (
        <div className="mt-4">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={5} />
        </div>
      )}

      {!loading && exercises.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-500">
            {query ? `No exercises match "${query}".` : 'No exercises yet. Create the first one.'}
          </p>
        </div>
      )}

      {!loading && exercises.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {exercises.map((ex) => (
            <li
              key={ex.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{ex.name}</p>
                {ex.tags && (
                  <p className="mt-0.5 text-xs text-zinc-400">{ex.tags}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(ex.id, ex.name)}
                aria-label={`Delete ${ex.name}`}
                className="ml-4 shrink-0 rounded p-1.5 text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
