/**
 * Tests for ExercisePicker modal.
 *
 * The component:
 * 1. Fetches all exercises on mount
 * 2. Filters client-side by search query and selected tag chips
 * 3. Shows a Favorites section when exercises have is_favorite=true
 * 4. On exercise click: calls POST /v1/blocks/{blockId}/items, then onSelect, then onClose
 * 5. Closes on Escape key press
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Exercise, BlockItem } from '@/app/_shared/api/types'
import { ExercisePicker } from './ExercisePicker'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeExercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: overrides.id ?? 'ex-1',
    coach_id: overrides.coach_id ?? 'coach-1',
    owner_type: overrides.owner_type ?? 'COACH',
    is_editable: overrides.is_editable ?? true,
    name: overrides.name ?? 'Push Up',
    description: overrides.description ?? 'A standard push up exercise with full range of motion.',
    tags: overrides.tags ?? ['strength', 'upper-body'],
    is_favorite: overrides.is_favorite ?? false,
    video_asset_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

const SQUAT = makeExercise({ id: 'ex-squat', name: 'Back Squat', tags: ['strength', 'lower-body'], owner_type: 'COMPANY', is_editable: false, coach_id: null })
const PUSHUP = makeExercise({ id: 'ex-push', name: 'Push Up', tags: ['strength', 'upper-body'] })
const PLANK = makeExercise({ id: 'ex-plank', name: 'Plank', tags: ['core'], is_favorite: true })

const MOCK_EXERCISES: Exercise[] = [SQUAT, PUSHUP, PLANK]

const MOCK_ITEM: BlockItem = {
  id: 'item-1',
  workout_block_id: 'blk-1',
  order: 0,
  sets: [{ order: 0, reps: null, weight: null, rpe: null }],
  exercise: SQUAT,
}

// ---------------------------------------------------------------------------
// Props helpers
// ---------------------------------------------------------------------------

function defaultProps(overrides: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
  return {
    blockId: 'blk-1',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockRequest.mockResolvedValue(MOCK_EXERCISES)  // GET /v1/exercises
})

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExercisePicker — rendering', () => {
  it('renders search input and filter chips', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    expect(screen.getByRole('searchbox', { name: /search exercises/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /strength/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /core/i })).toBeInTheDocument()
  })

  it('renders exercises after loading', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add back squat/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add push up/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add plank/i })).toBeInTheDocument()
    })
  })

  it('shows Favorites section when exercises have is_favorite=true', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /favorites/i })).toBeInTheDocument()
    })
    // Plank is the only favourite
    const favSection = screen.getByRole('region', { name: /favorites/i })
    expect(favSection).toHaveTextContent('Plank')
  })

  it('does not show Favorites section when no favorites', async () => {
    mockRequest.mockResolvedValueOnce(
      MOCK_EXERCISES.map((ex) => ({ ...ex, is_favorite: false })),
    )

    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add push up/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: /favorites/i })).toBeNull()
  })

  it('shows Official badge for COMPANY exercises', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add back squat/i })).toBeInTheDocument()
    })
    // COMPANY exercises are in the "Official" section
    const officialSection = screen.getByRole('region', { name: /official exercises/i })
    expect(officialSection).toHaveTextContent('Official')
  })
})

describe('ExercisePicker — search filter', () => {
  it('filters exercises by name (case-insensitive)', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add push up/i })).toBeInTheDocument()
    })

    const searchInput = screen.getByRole('searchbox', { name: /search exercises/i })
    fireEvent.change(searchInput, { target: { value: 'squat' } })

    expect(screen.getByRole('button', { name: /add back squat/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add push up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add plank/i })).toBeNull()
  })

  it('shows empty state when no matches', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add push up/i })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('searchbox', { name: /search exercises/i }), {
      target: { value: 'xyz-no-match' },
    })

    expect(screen.getByText(/no exercises match/i)).toBeInTheDocument()
  })
})

describe('ExercisePicker — tag filters', () => {
  it('filters by selected tag chip', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add push up/i })).toBeInTheDocument()
    })

    // Click the "Core" chip
    fireEvent.click(screen.getByRole('button', { name: /^core$/i }))

    // Only Plank has tag 'core'
    expect(screen.getByRole('button', { name: /add plank/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add push up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add back squat/i })).toBeNull()
  })

  it('chip shows aria-pressed=true when active', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^core$/i })).toBeInTheDocument()
    })

    const coreChip = screen.getByRole('button', { name: /^core$/i })
    expect(coreChip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(coreChip)
    expect(coreChip).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('ExercisePicker — exercise selection', () => {
  it('calls POST /v1/blocks/{blockId}/items then onSelect and onClose', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()

    mockRequest
      .mockResolvedValueOnce(MOCK_EXERCISES)  // GET /v1/exercises
      .mockResolvedValueOnce(MOCK_ITEM)       // POST /v1/blocks/blk-1/items

    render(<ExercisePicker blockId="blk-1" onSelect={onSelect} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add back squat/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /add back squat/i }))

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/blocks/blk-1/items',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(onSelect).toHaveBeenCalledWith(SQUAT, MOCK_ITEM)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows inline error and keeps modal open if POST fails', async () => {
    const onClose = vi.fn()

    mockRequest
      .mockResolvedValueOnce(MOCK_EXERCISES)
      .mockRejectedValueOnce(new Error('Server error'))

    render(<ExercisePicker blockId="blk-1" onSelect={vi.fn()} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add push up/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /add push up/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ExercisePicker — keyboard close', () => {
  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<ExercisePicker blockId="blk-1" onSelect={vi.fn()} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
