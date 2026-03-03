import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
  name: 'Back Squat',
  description: null,
  tags: 'strength, legs',
  video_asset_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const COACH_EX: Exercise = {
  id: 'ex-coach-1',
  coach_id: 'coach-uuid',
  owner_type: 'COACH',
  is_editable: true,
  name: 'My Custom Move',
  description: null,
  tags: null,
  video_asset_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockUseAuth.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExercisesPage — company vs coach sections', () => {
  it('renders "Official Exercises" section for COMPANY exercises', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COMPANY_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('region', { name: 'Official Exercises' })).toBeInTheDocument()
    expect(screen.getByText('Back Squat')).toBeInTheDocument()
  })

  it('renders "My Exercises" section for COACH exercises', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COACH_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('region', { name: 'My Exercises' })).toBeInTheDocument()
    expect(screen.getByText('My Custom Move')).toBeInTheDocument()
  })

  it('renders both sections when both types are present', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COMPANY_EX, COACH_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('region', { name: 'Official Exercises' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'My Exercises' })).toBeInTheDocument()
  })
})

describe('ExercisesPage — Official badge', () => {
  it('shows "Official" badge on company exercises', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.getByText('Official')).toBeInTheDocument()
  })

  it('does not show "Official" badge on coach exercises', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COACH_EX])

    render(<ExercisesPage />)

    await screen.findByText('My Custom Move')
    expect(screen.queryByText('Official')).not.toBeInTheDocument()
  })
})

describe('ExercisesPage — delete button visibility', () => {
  it('hides delete button for company exercises', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COMPANY_EX])

    render(<ExercisesPage />)

    await screen.findByText('Back Squat')
    expect(screen.queryByRole('button', { name: /delete back squat/i })).not.toBeInTheDocument()
  })

  it('shows delete button for coach exercises', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce([COACH_EX])

    render(<ExercisesPage />)

    expect(await screen.findByRole('button', { name: /delete my custom move/i })).toBeInTheDocument()
  })

  it('deletes a coach exercise when confirmed', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest
      .mockResolvedValueOnce([COACH_EX])   // initial fetch
      .mockResolvedValueOnce(undefined)     // DELETE 204

    vi.stubGlobal('confirm', () => true)

    render(<ExercisesPage />)

    const deleteBtn = await screen.findByRole('button', { name: /delete my custom move/i })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        `/v1/exercises/${COACH_EX.id}`,
        { method: 'DELETE' },
      )
    })

    vi.unstubAllGlobals()
  })
})
