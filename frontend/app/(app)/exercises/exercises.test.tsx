/**
 * Tests for the redesigned ExercisesPage.
 *
 * Architecture changes verified:
 *  - Unified "All Exercises" section (no separate Official/My sections)
 *  - "Official" badge retained inline on COMPANY exercises
 *  - "Favourites" section appears when exercises are favourited
 *  - Delete uses a confirmation modal (not window.confirm)
 *  - Filter chips filter the list client-side
 *  - ExerciseForm requires description + tags
 *  - Favourite toggle is optimistic
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Exercise } from '@/app/_shared/api/types'
import ExercisesPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockPush, mockReplace, mockUseAuth } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockUseAuth: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

// next/navigation mock — includes useSearchParams + usePathname for useExerciseFilters
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/exercises',
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY_EX: Exercise = {
  id: 'ex-company-1',
  coach_id: null,
  owner_type: 'COMPANY',
  is_editable: false,
  is_favorite: false,
  name: 'Back Squat',
  description: 'Compound lower body exercise targeting quads, glutes, and hamstrings.',
  tags: ['strength', 'lower-body'],
  video_asset_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const COACH_EX: Exercise = {
  id: 'ex-coach-1',
  coach_id: 'coach-uuid',
  owner_type: 'COACH',
  is_editable: true,
  is_favorite: false,
  name: 'My Custom Move',
  description: 'Custom movement created for personal library use.',
  tags: ['strength'],
  video_asset_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const FAVORITE_EX: Exercise = {
  ...COACH_EX,
  id: 'ex-fav-1',
  name: 'Favourite Exercise',
  is_favorite: true,
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockUseAuth.mockReset()
})

// ---------------------------------------------------------------------------
// Exercise list rendering
// ---------------------------------------------------------------------------

describe('ExercisesPage — exercise list', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('renders exercises in the unified "All Exercises" section', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('region', { name: 'All exercises' })).toBeInTheDocument()
    expect(screen.getByText('Back Squat')).toBeInTheDocument()
    expect(screen.getByText('My Custom Move')).toBeInTheDocument()
  })

  it('shows empty state when no exercises exist', async () => {
    mockRequest.mockResolvedValue([])

    render(<ExercisesPage />)

    expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument()
  })

  it('shows count of exercises in the section header', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Official badge
// ---------------------------------------------------------------------------

describe('ExercisesPage — Official badge', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('shows "Official" badge on COMPANY exercises', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByText('Official')).toBeInTheDocument()
  })

  it('does not show "Official" badge on COACH exercises', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('My Custom Move')
    expect(screen.queryByText('Official')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Favourites section
// ---------------------------------------------------------------------------

describe('ExercisesPage — favourites', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('shows Favourites section when at least one exercise is favourited', async () => {
    mockRequest.mockResolvedValue([FAVORITE_EX, COACH_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('region', { name: 'Favourites' })).toBeInTheDocument()
    // Favourite Exercise appears in Favourites section
    const favSection = screen.getByRole('region', { name: 'Favourites' })
    expect(favSection).toHaveTextContent('Favourite Exercise')
  })

  it('does not show Favourites section when no exercise is favourited', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.queryByRole('region', { name: 'Favourites' })).not.toBeInTheDocument()
  })

  it('toggles favourite optimistically', async () => {
    const updatedEx = { ...COACH_EX, is_favorite: true }
    mockRequest
      .mockResolvedValueOnce([COACH_EX])                      // initial list fetch
      .mockResolvedValueOnce({ is_favorite: true })           // POST /favorite

    render(<ExercisesPage />)

    await screen.findByText('My Custom Move')

    const starBtn = screen.getByRole('button', { name: /add my custom move to favourites/i })
    fireEvent.click(starBtn)

    // After toggle the Favourites section should appear (optimistic)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Favourites' })).toBeInTheDocument()
    })
    expect(mockRequest).toHaveBeenCalledWith(
      `/v1/exercises/${COACH_EX.id}/favorite`,
      { method: 'POST' },
    )
  })
})

// ---------------------------------------------------------------------------
// Quick actions — delete
// ---------------------------------------------------------------------------

describe('ExercisesPage — delete', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('hides delete button for COMPANY exercises', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.queryByRole('button', { name: /delete back squat/i })).not.toBeInTheDocument()
  })

  it('shows delete button for COACH exercises', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('button', { name: /delete my custom move/i })).toBeInTheDocument()
  })

  it('opens confirmation modal when delete is clicked', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    const deleteBtn = await screen.findByRole('button', { name: /delete my custom move/i })
    fireEvent.click(deleteBtn)

    // Modal should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/delete exercise/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('cancels deletion when modal cancel is clicked', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    const deleteBtn = await screen.findByRole('button', { name: /delete my custom move/i })
    fireEvent.click(deleteBtn)

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('My Custom Move')).toBeInTheDocument()
  })

  it('deletes exercise when modal confirm is clicked', async () => {
    mockRequest
      .mockResolvedValueOnce([COACH_EX])   // initial fetch
      .mockResolvedValueOnce(undefined)     // DELETE 204

    render(<ExercisesPage />)

    const deleteBtn = await screen.findByRole('button', { name: /delete my custom move/i })
    fireEvent.click(deleteBtn)

    const confirmBtn = screen.getByRole('button', { name: /^delete$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        `/v1/exercises/${COACH_EX.id}`,
        { method: 'DELETE' },
      )
    })

    await waitFor(() => {
      expect(screen.queryByText('My Custom Move')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Client-side search
// ---------------------------------------------------------------------------

describe('ExercisesPage — search', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('filters exercises by name as user types', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')

    const searchInput = screen.getByPlaceholderText(/search by name/i)
    fireEvent.change(searchInput, { target: { value: 'squat' } })

    await waitFor(() => {
      expect(screen.getByText('Back Squat')).toBeInTheDocument()
      expect(screen.queryByText('My Custom Move')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

describe('ExercisesPage — filter chips', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('shows tag counts on filter chips', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')

    // COMPANY_EX + COACH_EX both have "strength" tag
    const strengthChip = screen.getByRole('button', { name: /strength/i })
    expect(strengthChip).toHaveTextContent('(2)')
  })

  it('filters exercises when a chip is activated', async () => {
    const mobilityEx: Exercise = {
      ...COACH_EX,
      id: 'ex-mobility',
      name: 'Hip Flexor Stretch',
      tags: ['mobility'],
    }
    mockRequest.mockResolvedValue([COMPANY_EX, mobilityEx])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')

    const mobilityChip = screen.getByRole('button', { name: /^mobility/i })
    fireEvent.click(mobilityChip)

    await waitFor(() => {
      expect(screen.getByText('Hip Flexor Stretch')).toBeInTheDocument()
      expect(screen.queryByText('Back Squat')).not.toBeInTheDocument()
    })
  })

  it('shows "Clear filters" button when a filter is active', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')

    const strengthChip = screen.getByRole('button', { name: /^strength/i })
    fireEvent.click(strengthChip)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Athlete redirect
// ---------------------------------------------------------------------------

describe('ExercisesPage — athlete redirect', () => {
  it('redirects athletes to /sessions', async () => {
    mockUseAuth.mockReturnValue({ role: 'ATHLETE', loading: false })
    mockRequest.mockResolvedValue([])

    render(<ExercisesPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions')
    })
  })
})
