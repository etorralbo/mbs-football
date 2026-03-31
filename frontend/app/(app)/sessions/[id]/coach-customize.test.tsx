/**
 * Tests for coach session customization flow.
 *
 * Covers:
 * 1. Coach sees "Customize session" button; athlete does not
 * 2. "Customize session" toggles edit mode controls
 * 3. Inline prescription update — PATCH called, editor closes
 * 4. Prescription save failure — error shown
 * 5. Remove exercise success — DELETE called
 * 6. Remove exercise 409 conflict — user-friendly error shown, card stays
 * 7. Add exercise flow — picker opens, exercise tap calls POST
 * 8. "Customized" badge appears after a successful structural change
 * 9. Athlete sees no edit controls
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
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
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
      .mockResolvedValueOnce(BASE_EXECUTION)  // initial GET /execution
      .mockResolvedValueOnce(undefined)       // PATCH /structure/exercises/ex-1
      .mockResolvedValueOnce(BASE_EXECUTION)  // refresh GET /execution
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
    // PATCH not called; DELETE succeeds; refresh GET
    mockRequest
      .mockResolvedValueOnce(undefined)      // DELETE 204
      .mockResolvedValueOnce(BASE_EXECUTION) // refresh GET

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
      .mockResolvedValueOnce(undefined)      // POST 201
      .mockResolvedValueOnce(BASE_EXECUTION) // refresh GET

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
  it('is NOT shown before any edits', async () => {
    renderAsCoach()
    await screen.findByRole('button', { name: /customize session/i })
    expect(screen.queryByText('Customized')).toBeNull()
  })

  it('appears after a successful prescription save', async () => {
    renderAsCoach()
    // PATCH succeeds; refresh GET
    mockRequest
      .mockResolvedValueOnce(undefined)      // PATCH 204
      .mockResolvedValueOnce(BASE_EXECUTION) // refresh GET

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
      .mockResolvedValueOnce(undefined)      // DELETE 204
      .mockResolvedValueOnce(BASE_EXECUTION) // refresh GET

    fireEvent.click(await screen.findByRole('button', { name: /customize session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      expect(screen.getByText('Customized')).toBeInTheDocument()
    })
  })
})
