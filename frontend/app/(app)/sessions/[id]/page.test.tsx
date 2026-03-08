import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { SessionExecution } from '@/app/_shared/api/types'
import SessionDetailPage from './page'

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

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sess-1' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_EXECUTION: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  template_title: 'Power Session',
  athlete_profile_id: 'ath-1',
  scheduled_for: null,
  blocks: [],
}

const COMPLETED_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  status: 'completed',
}

const LOGGED_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {},
      logs: [{ set_number: 1, reps: 5, weight: 100, rpe: 8, done: true }],
    }],
  }],
}

// Execution with an exercise that has no logs yet — draft.done stays false,
// so inputs are not disabled by the done-state guard in SetRow.
const UNDONE_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {},
      logs: [],
    }],
  }],
}

/** Execution with array-format sets (3 prescribed sets). */
const ARRAY_SETS_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat',
      prescription: {
        sets: [
          { order: 0, reps: 10, weight: 80, rpe: 7 },
          { order: 1, reps: 8, weight: 90, rpe: 8 },
          { order: 2, reps: 6, weight: 100, rpe: 9 },
        ],
      },
      logs: [],
    }],
  }],
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

// Default: viewer is an athlete (existing tests unchanged)
beforeEach(() => {
  mockUseAuth.mockReturnValue({ role: 'ATHLETE', loading: false })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionDetailPage — Mark as completed', () => {
  it('renders "Mark as completed" button when session is pending', async () => {
    mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })
  })

  it('does not render complete button when session is already completed', async () => {
    mockRequest.mockResolvedValueOnce(COMPLETED_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('calls PATCH /complete and redirects to /sessions on success', async () => {
    mockRequest
      .mockResolvedValueOnce(LOGGED_EXECUTION)  // GET /execution (has done sets → CTA enabled)
      .mockResolvedValueOnce(undefined)          // PATCH complete (204)

    render(<SessionDetailPage />)

    const btn = await screen.findByRole('button', { name: /mark as completed/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/workout-sessions/sess-1/complete',
        { method: 'PATCH' },
      )
      expect(mockPush).toHaveBeenCalledWith('/sessions')
    })
  })

  it('shows inline error and does not redirect when PATCH fails', async () => {
    mockRequest
      .mockResolvedValueOnce(LOGGED_EXECUTION)
      .mockRejectedValueOnce(new Error('network error'))

    render(<SessionDetailPage />)

    const btn = await screen.findByRole('button', { name: /mark as completed/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to complete/i)
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('SessionDetailPage — COACH role', () => {
  it('hides CompletionBar when viewer is COACH and session is pending', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('hides CompletionBar when viewer is COACH and session is completed', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(COMPLETED_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('renders read-only values (not inputs) when viewer is COACH and session is pending', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(UNDONE_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    // Coach sees static text, not editable inputs
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('renders read-only values (not inputs) when viewer is COACH and session is completed', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce({ ...LOGGED_EXECUTION, status: 'completed' })

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('hides Undo button when viewer is COACH and exercise is done', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(LOGGED_EXECUTION) // sets done: true

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    expect(screen.queryByRole('button', { name: /undo squat/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Coach sees executed values (not prescribed) — session feedback projection
// ---------------------------------------------------------------------------

/** Completed session where athlete logged different values than prescribed. */
const EXECUTED_SESSION: SessionExecution = {
  ...EMPTY_EXECUTION,
  status: 'completed',
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat',
      prescription: {
        sets: [
          { order: 0, reps: 10, weight: 80, rpe: 7 },
          { order: 1, reps: 10, weight: 80, rpe: 7 },
        ],
      },
      logs: [
        { set_number: 1, reps: 12, weight: 95, rpe: 8, done: true },
        { set_number: 2, reps: 11, weight: 87, rpe: 9, done: true },
      ],
    }],
  }],
}

/** Pending session with prescribed sets but no execution logs yet. */
const PRESCRIBED_ONLY_SESSION: SessionExecution = {
  ...EMPTY_EXECUTION,
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat',
      prescription: {
        sets: [{ order: 0, reps: 10, weight: 80, rpe: 7 }],
      },
      logs: [],
    }],
  }],
}

describe('SessionDetailPage — Coach sees executed values', () => {
  it('shows athlete-executed values (not prescribed) for completed session', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(EXECUTED_SESSION)

    render(<SessionDetailPage />)

    await screen.findByText('Squat')

    // Executed values should be displayed (not the prescribed 10, 80, 7)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('shows prescribed values when session has no execution logs', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(PRESCRIBED_ONLY_SESSION)

    render(<SessionDetailPage />)

    await screen.findByText('Squat')

    // Prescribed values should be displayed as fallback
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('displays "0" correctly (not dash) when athlete logs zero reps', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    const ZERO_REPS_SESSION: SessionExecution = {
      ...EMPTY_EXECUTION,
      status: 'completed',
      blocks: [{
        name: 'Block A', key: 'BLOCK_A', order: 0,
        items: [{
          exercise_id: 'ex-1', exercise_name: 'Squat',
          prescription: { sets: [{ order: 0, reps: 5, weight: 60, rpe: 6 }] },
          logs: [{ set_number: 1, reps: 0, weight: 60, rpe: 6, done: true }],
        }],
      }],
    }
    mockRequest.mockResolvedValueOnce(ZERO_REPS_SESSION)

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    // "0" should render as "0", not as the dash placeholder
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Auto-save on complete — dirty entries persisted before PATCH /complete
// ---------------------------------------------------------------------------

describe('SessionDetailPage — Auto-save on complete', () => {
  it('saves unsaved draft entries before marking session complete', async () => {
    mockRequest
      .mockResolvedValueOnce(ARRAY_SETS_EXECUTION) // GET /execution
      .mockResolvedValue(undefined) // PUT /logs + PATCH /complete

    render(<SessionDetailPage />)

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(9)
    })

    // Edit set 1 reps (prescribed is 10, change to 15) — but don't mark done
    const repsInput = screen.getAllByLabelText(/set 1 reps/i)[0]
    fireEvent.change(repsInput, { target: { value: '15' } })

    // Complete without toggling individual sets done
    const completeBtn = screen.getByRole('button', { name: /mark as completed/i })
    fireEvent.click(completeBtn)

    await waitFor(() => {
      // Should have auto-saved draft via PUT /logs
      const putCalls = mockRequest.mock.calls.filter(
        (call) =>
          (call[0] as string).includes('/logs') && (call[1] as Record<string, string>)?.method === 'PUT',
      )
      expect(putCalls.length).toBeGreaterThan(0)

      // And then completed
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/workout-sessions/sess-1/complete',
        { method: 'PATCH' },
      )
    })

    expect(mockPush).toHaveBeenCalledWith('/sessions')
  })

  it('includes correct entry values in auto-save payload', async () => {
    mockRequest
      .mockResolvedValueOnce(ARRAY_SETS_EXECUTION) // GET /execution
      .mockResolvedValue(undefined) // PUT + PATCH

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(9)
    })

    // Edit set 1 reps to 15
    const repsInput = screen.getAllByLabelText(/set 1 reps/i)[0]
    fireEvent.change(repsInput, { target: { value: '15' } })

    fireEvent.click(screen.getByRole('button', { name: /mark as completed/i }))

    await waitFor(() => {
      const putCalls = mockRequest.mock.calls.filter(
        (call) =>
          (call[0] as string).includes('/logs') && (call[1] as Record<string, string>)?.method === 'PUT',
      )
      expect(putCalls.length).toBe(1)

      const body = JSON.parse(putCalls[0][1].body as string)
      expect(body.exercise_id).toBe('ex-1')
      // All 3 prescribed sets should be saved (all have non-empty values)
      expect(body.entries).toHaveLength(3)
      // First entry should have the edited reps value
      expect(body.entries[0].reps).toBe(15)
      expect(body.entries[0].set_number).toBe(1)
    })
  })

  it('skips auto-save when all entries are empty', async () => {
    mockRequest
      .mockResolvedValueOnce(UNDONE_EXECUTION) // prescription: {}, no logs -> 1 empty set
      .mockResolvedValue(undefined) // PATCH /complete only

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(3)
    })

    // Don't edit anything — just complete
    fireEvent.click(screen.getByRole('button', { name: /mark as completed/i }))

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/workout-sessions/sess-1/complete',
        { method: 'PATCH' },
      )
    })

    // No PUT /logs should have been called (only GET + PATCH)
    const putCalls = mockRequest.mock.calls.filter(
      (call) =>
        (call[0] as string).includes('/logs') &&
        (call[1] as Record<string, string>)?.method === 'PUT',
    )
    expect(putCalls).toHaveLength(0)
  })

  it('does NOT call PATCH /complete when PUT /logs fails', async () => {
    mockRequest
      .mockResolvedValueOnce(ARRAY_SETS_EXECUTION) // GET /execution
      .mockRejectedValueOnce(new Error('network error')) // PUT /logs fails

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(9)
    })

    // Edit a value so auto-save has something to PUT
    const repsInput = screen.getAllByLabelText(/set 1 reps/i)[0]
    fireEvent.change(repsInput, { target: { value: '15' } })

    fireEvent.click(screen.getByRole('button', { name: /mark as completed/i }))

    // Should show error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to complete/i)
    })

    // PATCH /complete must NOT have been called
    const patchCalls = mockRequest.mock.calls.filter(
      (call) =>
        (call[0] as string).includes('/complete') && (call[1] as Record<string, string>)?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(0)
    expect(mockPush).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Session isolation — execution values scoped to session instance
// ---------------------------------------------------------------------------

describe('SessionDetailPage — Session isolation', () => {
  it('renders execution values from this session only (different sessions independent)', async () => {
    // Session A: athlete logged reps=12, weight=95 for Squat
    const SESSION_A: SessionExecution = {
      ...EMPTY_EXECUTION,
      session_id: 'sess-A',
      status: 'completed',
      blocks: [{
        name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
        items: [{
          exercise_id: 'ex-1', exercise_name: 'Squat',
          prescription: { sets: [{ order: 0, reps: 10, weight: 80, rpe: 7 }] },
          logs: [{ set_number: 1, reps: 12, weight: 95, rpe: 8, done: true }],
        }],
      }],
    }
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(SESSION_A)

    render(<SessionDetailPage />)

    await screen.findByText('Squat')

    // Shows session A's executed values
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Athlete execution consistency — prescribed sets
// ---------------------------------------------------------------------------

describe('SessionDetailPage — Athlete execution consistency', () => {
  it('renders exactly 3 set rows when coach prescribed 3 sets (array format)', async () => {
    mockRequest.mockResolvedValueOnce(ARRAY_SETS_EXECUTION)

    render(<SessionDetailPage />)

    // Wait for HYDRATE effect to populate draft from prescribed sets
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs).toHaveLength(9) // 3 sets × 3 fields
    })
  })

  it('displays "3 sets" in prescription text when 3 sets prescribed', async () => {
    mockRequest.mockResolvedValueOnce(ARRAY_SETS_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByText(/3 sets/)).toBeInTheDocument()
    })
  })

  it('does not show "Add set" button for athlete', async () => {
    mockRequest.mockResolvedValueOnce(ARRAY_SETS_EXECUTION)

    render(<SessionDetailPage />)

    // Wait for full render including HYDRATE
    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(9)
    })
    expect(screen.queryByRole('button', { name: /add set/i })).toBeNull()
  })

  it('pre-fills prescribed values in athlete inputs', async () => {
    mockRequest.mockResolvedValueOnce(ARRAY_SETS_EXECUTION)

    render(<SessionDetailPage />)

    // Wait for HYDRATE to populate prescribed values
    await waitFor(() => {
      const repsInputs = screen.getAllByLabelText(/set 1 reps/i)
      expect((repsInputs[0] as HTMLInputElement).value).toBe('10')
    })

    const weightInputs = screen.getAllByLabelText(/set 1 weight/i)
    expect((weightInputs[0] as HTMLInputElement).value).toBe('80')
  })

  it('athlete can log values for prescribed sets', async () => {
    mockRequest.mockResolvedValueOnce(ARRAY_SETS_EXECUTION)

    render(<SessionDetailPage />)

    // Wait for HYDRATE before interacting
    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(9)
    })

    const repsInputs = screen.getAllByLabelText(/set 1 reps/i)
    fireEvent.change(repsInputs[0], { target: { value: '12' } })
    await waitFor(() => {
      expect((repsInputs[0] as HTMLInputElement).value).toBe('12')
    })
  })
})
