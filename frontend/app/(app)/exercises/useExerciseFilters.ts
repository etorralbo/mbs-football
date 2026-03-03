'use client'

/**
 * useExerciseFilters
 *
 * Manages filter state for the exercise library and persists it in the URL
 * via Next.js useSearchParams + useRouter.  This means:
 *   - Filters survive page refresh.
 *   - Shareable/bookmarkable filter state.
 *   - Back-button restores previous filter.
 *
 * URL format: /exercises?q=squat&tags=strength,lower-body
 */

import { useCallback, useMemo } from 'react'
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

  const filters: ExerciseFilters = useMemo(() => ({
    query: searchParams.get('q') ?? '',
    tags: searchParams.get('tags')
      ? searchParams.get('tags')!.split(',').filter(Boolean)
      : [],
  }), [searchParams])

  const updateParams = useCallback(
    (updates: Partial<ExerciseFilters>) => {
      const params = new URLSearchParams(searchParams.toString())
      const next = { ...filters, ...updates }

      if (next.query) {
        params.set('q', next.query)
      } else {
        params.delete('q')
      }

      if (next.tags.length > 0) {
        params.set('tags', next.tags.join(','))
      } else {
        params.delete('tags')
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, filters],
  )

  const setQuery = useCallback(
    (q: string) => updateParams({ query: q }),
    [updateParams],
  )

  const toggleTag = useCallback(
    (tag: string) => {
      const current = filters.tags
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]
      updateParams({ tags: next })
    },
    [filters.tags, updateParams],
  )

  const clearFilters = useCallback(
    () => updateParams({ query: '', tags: [] }),
    [updateParams],
  )

  const hasActiveFilters = filters.query.length > 0 || filters.tags.length > 0

  return { filters, setQuery, toggleTag, clearFilters, hasActiveFilters }
}
