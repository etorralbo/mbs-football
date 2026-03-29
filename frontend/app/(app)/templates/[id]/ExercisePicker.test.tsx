/**
 * Tests for ExercisePicker drawer.
 *
 * The component:
 * 1. Mounted only when drawer is open (parent handles conditional rendering)
 * 2. Fetches all exercises on mount and filters client-side
 * 3. Multi-select: toggle exercises, then click "Add N exercises" button
 * 4. POSTs each selected exercise sequentially to /v1/blocks/{blockId}/items
 * 5. Closes on Escape key or backdrop click
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
    video: null,
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

function makeBlockItem(exerciseId: string, order: number): BlockItem {
  const ex = MOCK_EXERCISES.find((e) => e.id === exerciseId) ?? SQUAT
  return {
    id: `item-${exerciseId}`,
    workout_block_id: 'blk-1',
    order,
    sets: [{ order: 0, reps: null, weight: null, rpe: null }],
    exercise: ex,
  }
}

// ---------------------------------------------------------------------------
// Props helpers
// ---------------------------------------------------------------------------

function defaultProps(overrides: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
  return {
    blockId: 'blk-1',
    onClose: vi.fn(),
    onExercisesAdded: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockRequest.mockResolvedValue(MOCK_EXERCISES) // GET /v1/exercises
})

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExercisePicker — open / close', () => {
  it('renders drawer dialog when mounted', async () => {
    render(<ExercisePicker {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /browse exercise library/i })).toBeInTheDocument()
    })
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<ExercisePicker {...defaultProps({ onClose })} />)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<ExercisePicker {...defaultProps({ onClose })} />)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Backdrop is the element with aria-hidden="true"
    const backdrop = screen.getByRole('dialog').parentElement!.querySelector('[aria-hidden="true"]')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(<ExercisePicker {...defaultProps({ onClose })} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close exercise picker/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /close exercise picker/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

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
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /select push up/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /select plank/i })).toBeInTheDocument()
    })
  })

  it('shows Favorites section when exercises have is_favorite=true', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /favorites/i })).toBeInTheDocument()
    })
    const favSection = screen.getByRole('region', { name: /favorites/i })
    expect(favSection).toHaveTextContent('Plank')
  })

  it('does not show Favorites section when no favorites', async () => {
    mockRequest.mockResolvedValueOnce(
      MOCK_EXERCISES.map((ex) => ({ ...ex, is_favorite: false })),
    )

    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select push up/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: /favorites/i })).toBeNull()
  })

  it('shows Official badge for COMPANY exercises', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    })
    const officialSection = screen.getByRole('region', { name: /official exercises/i })
    expect(officialSection).toHaveTextContent('Official')
  })
})

describe('ExercisePicker — search filter', () => {
  it('filters exercises by name (case-insensitive)', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select push up/i })).toBeInTheDocument()
    })

    const searchInput = screen.getByRole('searchbox', { name: /search exercises/i })
    fireEvent.change(searchInput, { target: { value: 'squat' } })

    expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /select push up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /select plank/i })).toBeNull()
  })

  it('shows empty state when no matches', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select push up/i })).toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: /select push up/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^core$/i }))

    expect(screen.getByRole('button', { name: /select plank/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /select push up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /select back squat/i })).toBeNull()
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

describe('ExercisePicker — multi-select', () => {
  it('footer button is disabled when nothing is selected', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select exercises/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /select exercises/i })).toBeDisabled()
  })

  it('toggling exercises updates selection count in footer button', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /select back squat/i }))
    expect(screen.getByText('Add 1 exercise')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /select push up/i }))
    expect(screen.getByText('Add 2 exercises')).toBeInTheDocument()

    // Deselect one
    fireEvent.click(screen.getByRole('button', { name: /deselect back squat/i }))
    expect(screen.getByText('Add 1 exercise')).toBeInTheDocument()
  })

  it('exercise row shows aria-pressed=true when selected', async () => {
    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    })

    const btn = screen.getByRole('button', { name: /select back squat/i })
    expect(btn).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: /deselect back squat/i })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('ExercisePicker — submit', () => {
  it('POSTs each selected exercise and calls onExercisesAdded', async () => {
    const onExercisesAdded = vi.fn()
    const onClose = vi.fn()

    const item1 = makeBlockItem('ex-squat', 0)
    const item2 = makeBlockItem('ex-push', 1)

    mockRequest
      .mockResolvedValueOnce(MOCK_EXERCISES)  // GET /v1/exercises
      .mockResolvedValueOnce(item1)           // POST item 1
      .mockResolvedValueOnce(item2)           // POST item 2

    render(<ExercisePicker {...defaultProps({ onExercisesAdded, onClose })} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    })

    // Select two exercises
    fireEvent.click(screen.getByRole('button', { name: /select back squat/i }))
    fireEvent.click(screen.getByRole('button', { name: /select push up/i }))

    // Click "Add 2 exercises"
    fireEvent.click(screen.getByText('Add 2 exercises'))

    await waitFor(() => {
      expect(onExercisesAdded).toHaveBeenCalledWith('blk-1', [item1, item2])
    })
    expect(onClose).toHaveBeenCalled()

    // Two POSTs should have been made (after the initial GET)
    const postCalls = mockRequest.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).startsWith('/v1/blocks/') && (args[1] as { method?: string })?.method === 'POST',
    )
    expect(postCalls).toHaveLength(2)
  })

  it('shows error and keeps drawer open when a POST fails mid-batch', async () => {
    const onClose = vi.fn()
    const onExercisesAdded = vi.fn()

    const item1 = makeBlockItem('ex-squat', 0)

    mockRequest
      .mockResolvedValueOnce(MOCK_EXERCISES)         // GET
      .mockResolvedValueOnce(item1)                   // POST item 1 succeeds
      .mockRejectedValueOnce(new Error('Server error')) // POST item 2 fails

    render(<ExercisePicker {...defaultProps({ onClose, onExercisesAdded })} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /select back squat/i }))
    fireEvent.click(screen.getByRole('button', { name: /select push up/i }))
    fireEvent.click(screen.getByText('Add 2 exercises'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // Partial success: first item was added
    expect(onExercisesAdded).toHaveBeenCalledWith('blk-1', [item1])
    // Drawer stays open (onClose not called because there was an error)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('prevents double submit — button is disabled while adding', async () => {
    // Use a never-resolving promise so the POST stays in-flight
    mockRequest
      .mockResolvedValueOnce(MOCK_EXERCISES) // GET
      .mockReturnValueOnce(new Promise(() => {})) // POST hangs

    render(<ExercisePicker {...defaultProps()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back squat/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /select back squat/i }))

    const addBtn = screen.getByText('Add 1 exercise')
    fireEvent.click(addBtn)

    // Button should now show "Adding…" and be disabled
    await waitFor(() => {
      expect(screen.getByText('Adding…')).toBeDisabled()
    })
  })
})
