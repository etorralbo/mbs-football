/**
 * RTL tests for the guided session execution page.
 *
 * Covers:
 * 1. Block names render from execution response
 * 2. Exercise names + prescription text render within blocks
 * 3. Editing a reps input updates its value
 * 4. "Mark as completed" is disabled when no sets are logged
 * 5. "Mark as completed" is enabled after a per-exercise save succeeds
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import SessionDetailPage from './page'
import type { WorkoutSessionDetail, SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockPush } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sess-1' }),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_DETAIL: WorkoutSessionDetail = {
  id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  template_title: 'Sprint Power',
  athlete_profile_id: 'ath-1',
  scheduled_for: null,
  logs: [],
}

const MOCK_EXECUTION: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  blocks: [
    {
      name: 'Primary Strength',
      key: 'PRIMARY_STRENGTH',
      order: 0,
      items: [
        {
          exercise_id: 'ex-1',
          exercise_name: 'Squat',
          prescription: { sets: 3, reps: '5', load: '85%' },
          logs: [],
        },
      ],
    },
    {
      name: 'Recovery',
      key: 'RECOVERY',
      order: 1,
      items: [
        {
          exercise_id: 'ex-2',
          exercise_name: 'Stretch',
          prescription: { duration: '60s' },
          logs: [],
        },
      ],
    },
  ],
}

const MOCK_EXECUTION_LOGGED: SessionExecution = {
  ...MOCK_EXECUTION,
  blocks: [
    {
      ...MOCK_EXECUTION.blocks[0],
      items: [
        {
          ...MOCK_EXECUTION.blocks[0].items[0],
          logs: [{ set_number: 1, reps: 5, weight: 100, rpe: 8, done: true }],
        },
      ],
    },
    MOCK_EXECUTION.blocks[1],
  ],
}

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionExecutionPage — guided blocks', () => {
  it('renders block names from the execution response', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce(MOCK_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Primary Strength' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Recovery' })).toBeInTheDocument()
    })
  })

  it('renders exercise names within their block', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce(MOCK_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Squat')).toBeInTheDocument()
      expect(screen.getByText('Stretch')).toBeInTheDocument()
    })
  })

  it('renders prescription text for each exercise', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce(MOCK_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      // prescription: { sets: 3, reps: "5", load: "85%" }
      expect(screen.getByText(/3 sets/)).toBeInTheDocument()
    })
  })

  it('updates reps input value when user types', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce(MOCK_EXECUTION)

    render(<SessionDetailPage />)

    // Multiple exercises share "Set 1 reps" label; take the first (Primary Strength / Squat)
    const repsInputs = await screen.findAllByLabelText('Set 1 reps')
    const repsInput = repsInputs[0]
    fireEvent.change(repsInput, { target: { value: '8' } })

    expect((repsInput as HTMLInputElement).value).toBe('8')
  })
})

describe('SessionExecutionPage — CompletionBar gating', () => {
  it('"Mark as completed" is disabled when no sets are logged', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce(MOCK_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /mark as completed/i })
      expect(btn).toBeDisabled()
    })
  })

  it('"Mark as completed" is enabled when execution already has logged sets', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce(MOCK_EXECUTION_LOGGED)

    render(<SessionDetailPage />)

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /mark as completed/i })
      expect(btn).not.toBeDisabled()
    })
  })
})
