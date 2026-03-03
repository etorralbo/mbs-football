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

import { useCallback, useState } from 'react'
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

export interface ExerciseFilters {
  query: string
  tags: string[]
}

export interface UseExerciseFiltersReturn {
  filters: ExerciseFilters
  setQuery: (q: string) => void
  toggleTag: (tag: string) => void
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

  // ---------------------------------------------------------------------------
  // URL sync helper (side-effect only — does not update local state)
  // ---------------------------------------------------------------------------
  const syncUrl = useCallback(
    (nextQuery: string, nextTags: string[]) => {
      const params = new URLSearchParams()
      if (nextQuery) params.set('q', nextQuery)
      if (nextTags.length > 0) params.set('tags', nextTags.join(','))
      const search = params.toString()
      router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
    },
    [router, pathname],
  )

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q)
      syncUrl(q, tags)
    },
    [tags, syncUrl],
  )

  const toggleTag = useCallback(
    (tag: string) => {
      const next = tags.includes(tag)
        ? tags.filter((t) => t !== tag)
        : [...tags, tag]
      setTagsState(next)
      syncUrl(query, next)
    },
    [query, tags, syncUrl],
  )

  const clearFilters = useCallback(() => {
    setQueryState('')
    setTagsState([])
    syncUrl('', [])
  }, [syncUrl])

  const hasActiveFilters = query.length > 0 || tags.length > 0

  return {
    filters: { query, tags },
    setQuery,
    toggleTag,
    clearFilters,
    hasActiveFilters,
  }
}
