import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { AiDraftResponse } from '@/app/_shared/api/types'
import { AiDraftPanel } from './AiDraftPanel'

// ---------------------------------------------------------------------------
// Module mocks (vi.hoisted so they exist when vi.mock factories run)
// ---------------------------------------------------------------------------

const { mockRequest, mockPush, mockReplace } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_DRAFT: AiDraftResponse = {
  title: 'Power Training Session',
  blocks: [
    {
      name: 'Preparation to Movement',
      notes: 'Warm up thoroughly before starting.',
      suggested_exercises: [
        { exercise_id: 'ex-1', score: 0.9, reason: 'Matched: warmup, mobility' },
      ],
    },
    {
      name: 'Plyometrics',
      notes: 'Focus on explosive movements.',
      suggested_exercises: [
        { exercise_id: 'ex-2', score: 0.85, reason: 'Matched: jump, explosive' },
      ],
    },
    { name: 'Primary Strength', notes: 'Heavy compound lifts.', suggested_exercises: [] },
    { name: 'Secondary Strength', notes: '', suggested_exercises: [] },
    { name: 'Auxiliary Strength', notes: '', suggested_exercises: [] },
    { name: 'Recovery', notes: 'Cool down and stretch.', suggested_exercises: [] },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillPromptAndGenerate(promptText = 'explosive power session', nameText = 'Power Session A') {
  fireEvent.change(screen.getByLabelText(/template name/i), {
    target: { value: nameText },
  })
  fireEvent.change(screen.getByRole('textbox', { name: /describe the workout/i }), {
    target: { value: promptText },
  })
  fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
}

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiDraftPanel — draft happy path', () => {
  it('renders all 6 block names after a successful draft call', async () => {
    mockRequest.mockResolvedValue(MOCK_DRAFT)
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(screen.getByText('Preparation to Movement')).toBeInTheDocument()
    })

    expect(screen.getByText('Plyometrics')).toBeInTheDocument()
    expect(screen.getByText('Primary Strength')).toBeInTheDocument()
    expect(screen.getByText('Secondary Strength')).toBeInTheDocument()
    expect(screen.getByText('Auxiliary Strength')).toBeInTheDocument()
    expect(screen.getByText('Recovery')).toBeInTheDocument()
  })

  it('renders the draft title', async () => {
    mockRequest.mockResolvedValue(MOCK_DRAFT)
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(screen.getByText('Power Training Session')).toBeInTheDocument()
    })
  })

  it('renders suggested exercise reasons', async () => {
    mockRequest.mockResolvedValue(MOCK_DRAFT)
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(screen.getByText(/Matched: warmup, mobility/)).toBeInTheDocument()
    })
  })

  it('calls POST /v1/ai/workout-template-draft with prompt and language', async () => {
    mockRequest.mockResolvedValue(MOCK_DRAFT)
    render(<AiDraftPanel />)

    fillPromptAndGenerate('power session for midfielder')

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/ai/workout-template-draft',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prompt: 'power session for midfielder', language: 'en' }),
        }),
      )
    })
  })

  it('shows a Confirm & Save button after a draft is generated', async () => {
    mockRequest.mockResolvedValue(MOCK_DRAFT)
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm & save/i })).toBeInTheDocument()
    })
  })
})

describe('AiDraftPanel — persist happy path', () => {
  it('calls POST /v1/workout-templates/from-ai and redirects to /templates/[id]', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DRAFT)             // generate
      .mockResolvedValueOnce({ id: 'tpl-abc' })      // save

    render(<AiDraftPanel />)

    // Step 1: generate
    fillPromptAndGenerate()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & save/i })).toBeInTheDocument(),
    )

    // Step 2: save
    fireEvent.click(screen.getByRole('button', { name: /confirm & save/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/templates/tpl-abc?fromAi=1')
    })
  })

  it('sends all 6 blocks in the save payload', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_DRAFT)
      .mockResolvedValueOnce({ id: 'tpl-abc' })

    render(<AiDraftPanel />)

    fillPromptAndGenerate()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & save/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm & save/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalled())

    const saveCall = mockRequest.mock.calls.find(
      (call: unknown[]) => call[0] === '/v1/workout-templates/from-ai',
    )
    expect(saveCall).toBeDefined()
    const payload = JSON.parse((saveCall![1] as RequestInit).body as string)
    expect(payload.title).toBe('Power Session A')
    expect(payload.blocks).toHaveLength(6)
  })
})

describe('AiDraftPanel — error states', () => {
  it('shows an error when draft generation fails', async () => {
    mockRequest.mockRejectedValue(new Error('network error'))
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to generate draft')
    })
  })

  it('redirects to /onboarding on a not-onboarded 403', async () => {
    const { ForbiddenError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValue(
      new ForbiddenError('User not onboarded. Please complete registration.'),
    )
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('redirects to /login on 401', async () => {
    const { UnauthorizedError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValue(new UnauthorizedError())
    render(<AiDraftPanel />)

    fillPromptAndGenerate()

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })
})
