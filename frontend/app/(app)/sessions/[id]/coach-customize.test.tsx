/**
 * Tests for coach session customization flow.
 *
 * Covers:
 *  1. Coach sees "Customize session" button; athlete does not
 *  2. "Customize session" toggles edit mode controls
 *  3. Inline prescription update — PATCH called, editor closes
 *  4. Prescription save failure — error shown
 *  5. Remove exercise success — DELETE called
 *  6. Remove exercise 409 conflict — user-friendly error shown, card stays
 *  7. Add exercise flow — picker opens, exercise tap calls POST
 *  8. "Customized" badge appears after a successful structural change
 *  9. Athlete sees no edit controls
 * 10. Scoping copy visibility
 * 11. Failed add exercise — picker stays open
 * 12. Add/remove sets in PrescriptionEditor
 * 13. Add block flow
 * 14. Remove block flow
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { SessionExecution } from '@/app/_shared/api/types'
import SessionDetailPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockUseAuth } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockUseAuth: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sess-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

// Stub FILTER_CHIPS so we don't need the real exercise filter implementation
vi.mock('@/app/(app)/exercises/useExerciseFilters', () => ({
  FILTER_CHIPS: [{ label: 'Strength', value: 'strength' }],
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_EXECUTION: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  template_title: 'Power Session',
  athlete_profile_id: 'ath-1',
  scheduled_for: null,
  has_session_structure: false,
  blocks: [
    {
      name: 'Primary Strength',
      key: 'PRIMARY_STRENGTH',
      order: 0,
      items: [
        {
          exercise_id: 'ex-1',
          exercise_name: 'Squat',
          prescription: {
            sets: [
              { order: 0, reps: 5, weight: 100, rpe: 8 },
              { order: 1, reps: 5, weight: 100, rpe: 8 },
            ],
          },
          logs: [],
        },
      ],
    },
  ],
}

// Execution returned after a structural edit — backend now has session_structure set
const CUSTOMIZED_EXECUTION: SessionExecution = { ...BASE_EXECUTION, has_session_structure: true }

const LIBRARY_EXERCISES = [
  {
    id: 'ex-lib-1',
    name: 'Deadlift',
    owner_type: 'COMPANY',
    is_editable: false,
    is_favorite: false,
    coach_id: null,
    description: 'A classic compound lift',
    tags: ['strength'],
    video: null,
    video_asset_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockUseAuth.mockReset()
})

// ---------------------------------------------------------------------------
// Helper: render with coach role, initial execution loaded
// ---------------------------------------------------------------------------

function renderAsCoach(execution = BASE_EXECUTION) {
  mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
  // First call: GET /execution (initial load)
  mockRequest.mockResolvedValueOnce(execution)
  render(<SessionDetailPage />)
}

function renderAsAthlete(execution = BASE_EXECUTION) {
  mockUseAuth.mockReturnValue({ role: 'ATHLETE', loading: false })
  mockRequest.mockResolvedValueOnce(execution)
  render(<SessionDetailPage />)
}

// ---------------------------------------------------------------------------
// 1. Role gate: coach vs athlete
// ---------------------------------------------------------------------------

describe('Coach customization controls — role gate', () => {
  it('coach sees "Customize session" button for a pending session', async () => {
    renderAsCoach()
    expect(await screen.findByRole('button', { name: /customize session/i })).toBeInTheDocument()
  })

  it('coach does NOT see "Customize session" button for a completed session', async () => {
    renderAsCoach({ ...BASE_EXECUTION, status: 'completed' })
    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /customize session/i })).toBeNull()
  })

  it('athlete does NOT see "Customize session" button', async () => {
    renderAsAthlete()
    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /customize session/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Edit mode toggle
// ---------------------------------------------------------------------------

describe('Edit mode toggle', () => {
  it('clicking "Customize session" reveals per-exercise edit controls', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit prescription/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument()
    })
  })

  it('clicking "Done editing" hides edit controls', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    await screen.findByRole('button', { name: /edit prescription/i })

    fireEvent.click(screen.getByRole('button', { name: /done editing/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /edit prescription/i })).toBeNull()
    })
  })

  it('reveals "Add exercise" button per block in edit mode', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add exercise to primary strength/i })).toBeInTheDocument()
    })
  })

  it('athlete never sees edit controls (no inputs that look like prescription editing)', async () => {
    renderAsAthlete()
    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /edit prescription/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3 & 4. Prescription editing
// ---------------------------------------------------------------------------

describe('Prescription editing', () => {
  it('clicking "Edit prescription" reveals the inline editor', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  it('saving prescription calls PATCH with correct payload', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    // Explicit sequence: initial GET → PATCH → refresh GET
    mockRequest
      .mockResolvedValueOnce(BASE_EXECUTION)        // initial GET /execution
      .mockResolvedValueOnce(undefined)             // PATCH /structure/exercises/ex-1
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION)  // refresh GET /execution
    render(<SessionDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))

    // Edit set 1 reps
    const repsInput = await screen.findByLabelText(/prescribed set 1 reps/i)
    fireEvent.change(repsInput, { target: { value: '8' } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const patchCalls = mockRequest.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/structure/exercises/ex-1') &&
          (call[1] as Record<string, string>)?.method === 'PATCH',
      )
      expect(patchCalls).toHaveLength(1)
      const body = JSON.parse(patchCalls[0][1].body as string)
      expect(body.sets[0].reps).toBe(8)
    })

    // Wait for the full async refresh to settle (setIsCustomized is the last state update)
    await waitFor(() => {
      expect(screen.getByText('Customized')).toBeInTheDocument()
    })
  })

  it('shows save error when PATCH fails', async () => {
    renderAsCoach()
    mockRequest.mockRejectedValueOnce(new Error('server error'))  // PATCH fails

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to save prescription/i)
    })
  })

  it('cancel closes the prescription editor without calling PATCH', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
    })

    // Only the initial GET should have been called
    const patchCalls = mockRequest.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('/structure/exercises') &&
        (call[1] as Record<string, string>)?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5 & 6. Remove exercise
// ---------------------------------------------------------------------------

describe('Remove exercise', () => {
  it('successful removal calls DELETE endpoint', async () => {
    renderAsCoach()
    // DELETE succeeds; refresh GET
    mockRequest
      .mockResolvedValueOnce(undefined)            // DELETE 204
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION) // refresh GET

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      const deleteCalls = mockRequest.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/structure/exercises/ex-1') &&
          (call[1] as Record<string, string>)?.method === 'DELETE',
      )
      expect(deleteCalls).toHaveLength(1)
    })
  })

  it('shows conflict message (409) and does NOT remove exercise from UI', async () => {
    renderAsCoach()
    const { ConflictError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValueOnce(new ConflictError())  // DELETE → 409

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already has athlete logs/i)
    })

    // Exercise card should still be visible
    expect(screen.getByText('Squat')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 7. Add exercise flow
// ---------------------------------------------------------------------------

describe('Add exercise flow', () => {
  it('clicking "Add exercise" opens the picker drawer', async () => {
    renderAsCoach()
    // GET /exercises for picker
    mockRequest.mockResolvedValueOnce(LIBRARY_EXERCISES)

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add exercise to primary strength/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /add exercise to primary strength/i })).toBeInTheDocument()
    })
  })

  it('clicking an exercise in the picker calls POST and closes the drawer', async () => {
    renderAsCoach()
    // GET /exercises for picker
    mockRequest.mockResolvedValueOnce(LIBRARY_EXERCISES)

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add exercise to primary strength/i }))

    // Wait for exercise list to load
    await screen.findByRole('button', { name: /add deadlift/i })

    // Schedule POST success + refresh GET
    mockRequest
      .mockResolvedValueOnce(undefined)            // POST 201
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION) // refresh GET

    fireEvent.click(screen.getByRole('button', { name: /add deadlift/i }))

    await waitFor(() => {
      const postCalls = mockRequest.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/structure/exercises') &&
          (call[1] as Record<string, string>)?.method === 'POST',
      )
      expect(postCalls).toHaveLength(1)
      const body = JSON.parse(postCalls[0][1].body as string)
      expect(body.exercise_id).toBe('ex-lib-1')
      expect(body.block_index).toBe(0)
    })

    // Drawer should close after success
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add exercise to primary strength/i })).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// 8. Customized badge
// ---------------------------------------------------------------------------

describe('"Customized" badge', () => {
  it('is shown on page load for an already-customized session', async () => {
    renderAsCoach(CUSTOMIZED_EXECUTION)
    expect(await screen.findByText('Customized')).toBeInTheDocument()
  })

  it('is NOT shown before any edits', async () => {
    renderAsCoach()
    await screen.findByRole('button', { name: /customize session/i })
    expect(screen.queryByText('Customized')).toBeNull()
  })

  it('appears after a successful prescription save', async () => {
    renderAsCoach()
    // PATCH succeeds; refresh GET returns has_session_structure: true
    mockRequest
      .mockResolvedValueOnce(undefined)            // PATCH 204
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION) // refresh GET

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(screen.getByText('Customized')).toBeInTheDocument()
    })
  })

  it('appears after a successful exercise removal', async () => {
    renderAsCoach()
    mockRequest
      .mockResolvedValueOnce(undefined)            // DELETE 204
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION) // refresh GET

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      expect(screen.getByText('Customized')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 9. Scoping copy
// ---------------------------------------------------------------------------

describe('Scoping copy', () => {
  it('is shown for coach when edit mode is active', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))

    await waitFor(() => {
      expect(screen.getByText(/changes here only affect this athlete/i)).toBeInTheDocument()
    })
  })

  it('is hidden when edit mode is toggled off', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    await screen.findByText(/changes here only affect this athlete/i)

    fireEvent.click(screen.getByRole('button', { name: /done editing/i }))

    await waitFor(() => {
      expect(screen.queryByText(/changes here only affect this athlete/i)).toBeNull()
    })
  })

  it('is never shown for athletes', async () => {
    renderAsAthlete()
    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByText(/changes here only affect this athlete/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 10. Failed add exercise — picker stays open with error
// ---------------------------------------------------------------------------

describe('Failed add exercise', () => {
  it('shows error in picker and keeps drawer open when POST fails', async () => {
    renderAsCoach()
    mockRequest.mockResolvedValueOnce(LIBRARY_EXERCISES)  // GET /exercises

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add exercise to primary strength/i }))

    // Wait for exercises to load
    await screen.findByRole('button', { name: /add deadlift/i })

    // POST fails
    mockRequest.mockRejectedValueOnce(new Error('server error'))
    fireEvent.click(screen.getByRole('button', { name: /add deadlift/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not add exercise/i)
      expect(screen.getByRole('dialog', { name: /add exercise to primary strength/i })).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 12. Add/remove sets in PrescriptionEditor
// ---------------------------------------------------------------------------

describe('PrescriptionEditor — add/remove sets', () => {
  it('"Add set" button appears when editing a prescription', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add set/i })).toBeInTheDocument()
    })
  })

  it('clicking "Add set" adds a new set row', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))

    // BASE_EXECUTION has 2 sets → 2 "Prescribed set N reps" inputs
    await screen.findByLabelText(/prescribed set 1 reps/i)
    expect(screen.queryByLabelText(/prescribed set 3 reps/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /add set/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/prescribed set 3 reps/i)).toBeInTheDocument()
    })
  })

  it('"Remove set" is disabled when only one set remains', async () => {
    // Use execution with a single-set prescription
    const singleSetExecution: SessionExecution = {
      ...BASE_EXECUTION,
      blocks: [{
        ...BASE_EXECUTION.blocks[0],
        items: [{
          ...BASE_EXECUTION.blocks[0].items[0],
          prescription: { sets: [{ order: 0, reps: 5, weight: 100, rpe: 8 }] },
        }],
      }],
    }
    renderAsCoach(singleSetExecution)
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove set 1/i })).toBeDisabled()
    })
  })

  it('clicking "Remove set" removes the row', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit prescription/i }))

    // BASE_EXECUTION has 2 sets
    await screen.findByLabelText(/prescribed set 2 reps/i)

    fireEvent.click(screen.getByRole('button', { name: /remove set 2/i }))

    await waitFor(() => {
      expect(screen.queryByLabelText(/prescribed set 2 reps/i)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// 13. Add block flow
// ---------------------------------------------------------------------------

describe('Add block', () => {
  it('"Add block" button appears in edit mode', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add block/i })).toBeInTheDocument()
    })
  })

  it('clicking "Add block" shows the block creation form', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add block/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create block/i })).toBeInTheDocument()
    })
  })

  it('creating a block calls POST /structure/blocks and refreshes', async () => {
    renderAsCoach()
    // POST succeeds; refresh GET
    mockRequest
      .mockResolvedValueOnce(undefined)             // POST 201
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION)  // refresh GET

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add block/i }))
    fireEvent.click(await screen.findByRole('button', { name: /create block/i }))

    await waitFor(() => {
      const postCalls = mockRequest.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/structure/blocks') &&
          (call[1] as Record<string, string>)?.method === 'POST',
      )
      expect(postCalls).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// 14. Remove block flow
// ---------------------------------------------------------------------------

describe('Remove block', () => {
  it('"Remove block" button appears per block in edit mode', async () => {
    renderAsCoach()
    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove block/i })).toBeInTheDocument()
    })
  })

  it('removing a block calls DELETE /structure/blocks/0 and refreshes', async () => {
    renderAsCoach()
    mockRequest
      .mockResolvedValueOnce(undefined)             // DELETE 204
      .mockResolvedValueOnce(CUSTOMIZED_EXECUTION)  // refresh GET

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /remove block/i }))

    await waitFor(() => {
      const deleteCalls = mockRequest.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/structure/blocks/0') &&
          (call[1] as Record<string, string>)?.method === 'DELETE',
      )
      expect(deleteCalls).toHaveLength(1)
    })
  })

  it('shows 409 error message when block has logged exercises', async () => {
    renderAsCoach()
    const { ConflictError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValueOnce(new ConflictError())

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /remove block/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/athlete logs/i)
    })
  })
})
