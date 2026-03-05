'use client'

/**
 * useExerciseFilters
 *
 * Manages filter state for the exercise library.
 *
 * Architecture:
 *  - Local React state is the source of truth (immediate reactivity).
 *  - URL params are kept in sync as a side-effect so filters are shareable,
 *    bookmarkable, and survive page refresh.
 *  - On mount the hook initialises from URL (e.g. after a hard-refresh or
 *    navigating to a bookmarked filtered URL).
 *
 * URL format: /exercises?q=squat&tags=strength,lower-body
 */

import { useCallback, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Predefined filter chips shown in the UI.
export const FILTER_CHIPS = [
  { label: 'Strength',     value: 'strength'     },
  { label: 'Power',        value: 'power'        },
  { label: 'Mobility',     value: 'mobility'     },
  { label: 'Conditioning', value: 'conditioning' },
  { label: 'Core',         value: 'core'         },
  { label: 'Upper Body',   value: 'upper-body'   },
  { label: 'Lower Body',   value: 'lower-body'   },
] as const

export type FilterChipValue = (typeof FILTER_CHIPS)[number]['value']

export type Scope = 'all' | 'official' | 'mine'

export interface ExerciseFilters {
  query: string
  tags: string[]
  scope: Scope
}

export interface UseExerciseFiltersReturn {
  filters: ExerciseFilters
  setQuery: (q: string) => void
  toggleTag: (tag: string) => void
  setScope: (scope: Scope) => void
  clearFilters: () => void
  hasActiveFilters: boolean
}

export function useExerciseFilters(): UseExerciseFiltersReturn {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Local React state initialised from URL params (so hard-refresh restores filters).
  const [query, setQueryState] = useState<string>(
    () => searchParams.get('q') ?? '',
  )
  const [tags, setTagsState] = useState<string[]>(() => {
    const raw = searchParams.get('tags')
    return raw ? raw.split(',').filter(Boolean) : []
  })
  const [scope, setScopeState] = useState<Scope>(() => {
    const raw = searchParams.get('scope')
    return raw === 'official' || raw === 'mine' ? raw : 'all'
  })

  // ---------------------------------------------------------------------------
  // URL sync helper (debounced — avoids spamming browser history on keystrokes)
  // ---------------------------------------------------------------------------
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncUrl = useCallback(
    (nextQuery: string, nextTags: string[], nextScope: Scope) => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => {
        const params = new URLSearchParams()
        if (nextQuery) params.set('q', nextQuery)
        if (nextTags.length > 0) params.set('tags', nextTags.join(','))
        if (nextScope !== 'all') params.set('scope', nextScope)
        const search = params.toString()
        router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
      }, 300)
    },
    [router, pathname],
  )

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q)
      syncUrl(q, tags, scope)
    },
    [tags, scope, syncUrl],
  )

  const toggleTag = useCallback(
    (tag: string) => {
      const next = tags.includes(tag)
        ? tags.filter((t) => t !== tag)
        : [...tags, tag]
      setTagsState(next)
      syncUrl(query, next, scope)
    },
    [query, tags, scope, syncUrl],
  )

  const setScope = useCallback(
    (s: Scope) => {
      setScopeState(s)
      syncUrl(query, tags, s)
    },
    [query, tags, syncUrl],
  )

  const clearFilters = useCallback(() => {
    setQueryState('')
    setTagsState([])
    setScopeState('all')
    syncUrl('', [], 'all')
  }, [syncUrl])

  const hasActiveFilters = query.length > 0 || tags.length > 0 || scope !== 'all'

  return {
    filters: { query, tags, scope },
    setQuery,
    toggleTag,
    setScope,
    clearFilters,
    hasActiveFilters,
  }
}
