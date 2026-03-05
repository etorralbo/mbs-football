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
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react'
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
    // The section header shows "(2)"; there may be other "(2)" elements (chip counts)
    // so we scope the query to the section to be precise.
    const allSection = screen.getByRole('region', { name: 'All exercises' })
    expect(within(allSection).getByText('(2)')).toBeInTheDocument()
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

    const section = await screen.findByRole('region', { name: 'All exercises' })
    expect(within(section).getByText('Official')).toBeInTheDocument()
  })

  it('does not show "Official" badge on COACH exercises', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    const section = await screen.findByRole('region', { name: 'All exercises' })
    expect(within(section).queryByText('Official')).not.toBeInTheDocument()
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

  it('closes modal when Escape key is pressed', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    const deleteBtn = await screen.findByRole('button', { name: /delete my custom move/i })
    fireEvent.click(deleteBtn)

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('My Custom Move')).toBeInTheDocument()
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
// Scope selector
// ---------------------------------------------------------------------------

describe('ExercisesPage — scope selector', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('renders three scope buttons: All, Official, Mine', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Official$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Mine$/i })).toBeInTheDocument()
  })

  it('"All" is the default active scope', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByRole('button', { name: /^All$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Official$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^Mine$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking "Official" shows only COMPANY exercises', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    fireEvent.click(screen.getByRole('button', { name: /^Official$/i }))

    await waitFor(() => {
      expect(screen.getByText('Back Squat')).toBeInTheDocument()
      expect(screen.queryByText('My Custom Move')).not.toBeInTheDocument()
    })
  })

  it('clicking "Mine" shows only COACH exercises', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    fireEvent.click(screen.getByRole('button', { name: /^Mine$/i }))

    await waitFor(() => {
      expect(screen.queryByText('Back Squat')).not.toBeInTheDocument()
      expect(screen.getByText('My Custom Move')).toBeInTheDocument()
    })
  })

  it('clicking "All" resets the scope filter', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    fireEvent.click(screen.getByRole('button', { name: /^Mine$/i }))
    await waitFor(() => expect(screen.queryByText('Back Squat')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^All$/i }))

    await waitFor(() => {
      expect(screen.getByText('Back Squat')).toBeInTheDocument()
      expect(screen.getByText('My Custom Move')).toBeInTheDocument()
    })
  })

  it('scope combines with tag filters', async () => {
    const mobilityCoach: Exercise = {
      ...COACH_EX,
      id: 'ex-mob-coach',
      name: 'Coach Mobility Drill',
      tags: ['mobility'],
    }
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX, mobilityCoach])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    // Select "Mine" scope
    fireEvent.click(screen.getByRole('button', { name: /^Mine$/i }))
    // Activate "strength" tag
    fireEvent.click(screen.getByRole('button', { name: /^strength/i }))

    await waitFor(() => {
      // Only COACH exercises with "strength" tag
      expect(screen.getByText('My Custom Move')).toBeInTheDocument()
      expect(screen.queryByText('Back Squat')).not.toBeInTheDocument()
      expect(screen.queryByText('Coach Mobility Drill')).not.toBeInTheDocument()
    })
  })

  it('"Clear filters" also resets scope back to "All"', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    // Set scope to "Mine"
    fireEvent.click(screen.getByRole('button', { name: /^Mine$/i }))
    await waitFor(() => expect(screen.queryByText('Back Squat')).not.toBeInTheDocument())

    // Clear filters
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))

    await waitFor(() => {
      expect(screen.getByText('Back Squat')).toBeInTheDocument()
      expect(screen.getByText('My Custom Move')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^All$/i })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})

// ---------------------------------------------------------------------------
// URL param persistence — scope
// ---------------------------------------------------------------------------

describe('ExercisesPage — scope URL param', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('syncs scope to URL when changed', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    fireEvent.click(screen.getByRole('button', { name: /^Official$/i }))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining('scope=official'),
        expect.anything(),
      )
    })
  })

  it('does not include scope=all in URL (it is the default)', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    // Click "Official" then back to "All"
    fireEvent.click(screen.getByRole('button', { name: /^Official$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^All$/i }))

    await waitFor(() => {
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]
      expect(lastCall[0]).not.toContain('scope=')
    })
  })
})

// ---------------------------------------------------------------------------
// Quick actions — per owner_type
// ---------------------------------------------------------------------------

describe('ExercisesPage — action visibility per owner_type', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('COMPANY card shows Duplicate but hides Edit and Delete', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByRole('button', { name: /duplicate back squat to my library/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit back squat$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete back squat$/i })).not.toBeInTheDocument()
  })

  it('COACH card shows Edit, Duplicate, and Delete', async () => {
    mockRequest.mockResolvedValue([COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('My Custom Move')
    expect(screen.getByRole('button', { name: /edit my custom move/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /duplicate my custom move/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete my custom move/i })).toBeInTheDocument()
  })

  it('favourite button is always visible regardless of owner_type', async () => {
    mockRequest.mockResolvedValue([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByRole('button', { name: /add back squat to favourites/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Duplicate action
// ---------------------------------------------------------------------------

describe('ExercisesPage — duplicate', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('duplicates a COACH exercise and adds the copy to the list', async () => {
    const copy: Exercise = { ...COACH_EX, id: 'ex-copy', name: 'My Custom Move (copy)' }
    mockRequest
      .mockResolvedValueOnce([COACH_EX])   // initial fetch
      .mockResolvedValueOnce(copy)          // POST create (duplicate)

    render(<ExercisesPage />)

    const dupBtn = await screen.findByRole('button', { name: /duplicate my custom move/i })
    fireEvent.click(dupBtn)

    expect(await screen.findByText('My Custom Move (copy)')).toBeInTheDocument()
    expect(mockRequest).toHaveBeenCalledWith(
      '/v1/exercises',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'My Custom Move (copy)',
          description: COACH_EX.description,
          tags: COACH_EX.tags,
        }),
      }),
    )
  })

  it('duplicates a COMPANY exercise to "my library"', async () => {
    const copy: Exercise = { ...COMPANY_EX, id: 'ex-copy', name: 'Back Squat (copy)', owner_type: 'COACH', is_editable: true, coach_id: 'coach-uuid' }
    mockRequest
      .mockResolvedValueOnce([COMPANY_EX])  // initial fetch
      .mockResolvedValueOnce(copy)           // POST create

    render(<ExercisesPage />)

    const dupBtn = await screen.findByRole('button', { name: /duplicate back squat to my library/i })
    fireEvent.click(dupBtn)

    expect(await screen.findByText('Back Squat (copy)')).toBeInTheDocument()
  })

  it('shows error toast when duplicate fails', async () => {
    mockRequest
      .mockResolvedValueOnce([COACH_EX])             // initial fetch
      .mockRejectedValueOnce(new Error('conflict'))   // POST fails

    render(<ExercisesPage />)

    const dupBtn = await screen.findByRole('button', { name: /duplicate my custom move/i })
    fireEvent.click(dupBtn)

    expect(await screen.findByRole('status')).toHaveTextContent(/could not duplicate/i)
  })
})

// ---------------------------------------------------------------------------
// Delete — error handling
// ---------------------------------------------------------------------------

describe('ExercisesPage — delete errors', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('shows error toast when delete fails (exercise in use)', async () => {
    mockRequest
      .mockResolvedValueOnce([COACH_EX])             // initial fetch
      .mockRejectedValueOnce(new Error('conflict'))   // DELETE 409

    render(<ExercisesPage />)

    const deleteBtn = await screen.findByRole('button', { name: /delete my custom move/i })
    fireEvent.click(deleteBtn)

    const confirmBtn = screen.getByRole('button', { name: /^delete$/i })
    fireEvent.click(confirmBtn)

    expect(await screen.findByRole('status')).toHaveTextContent(/could not delete.*in use/i)
    // Exercise should still be in the list
    expect(screen.getByText('My Custom Move')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Favourite — optimistic rollback on error
// ---------------------------------------------------------------------------

describe('ExercisesPage — favourite rollback', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  })

  it('reverts favourite toggle when API call fails', async () => {
    mockRequest
      .mockResolvedValueOnce([COACH_EX])                       // initial fetch (is_favorite: false)
      .mockRejectedValueOnce(new Error('network error'))       // POST /favorite fails

    render(<ExercisesPage />)

    await screen.findByText('My Custom Move')
    // Should not be in favourites initially
    expect(screen.queryByRole('region', { name: 'Favourites' })).not.toBeInTheDocument()

    const starBtn = screen.getByRole('button', { name: /add my custom move to favourites/i })
    fireEvent.click(starBtn)

    // Optimistic: favourites section should appear
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Favourites' })).toBeInTheDocument()
    })

    // After error: favourites section should disappear (rollback)
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Favourites' })).not.toBeInTheDocument()
    })

    // Error toast should show
    expect(screen.getByRole('status')).toHaveTextContent(/could not update favourite/i)
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
