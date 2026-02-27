import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import TeamPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// vi.hoisted ensures these are available when vi.mock factory functions run.
const { mockRequest, mockWriteText, mockRouter } = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    mockRequest: vi.fn(),
    mockWriteText: vi.fn().mockResolvedValue(undefined),
    // A stable object reference so useEffect([router]) does NOT re-run on
    // every re-render (new object ≠ previous object in React's dependency check).
    mockRouter: { replace },
  }
})

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

// ---------------------------------------------------------------------------

beforeEach(() => {
  // jsdom may not expose navigator.clipboard; define it before each test.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  })
})

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockRouter.replace.mockReset()
  mockWriteText.mockReset()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const coachMe = {
  user_id: 'u1',
  memberships: [{ team_id: 't1', team_name: 'Mettle FC', role: 'COACH' }],
  active_team_id: 't1',
}

const athleteMe = {
  user_id: 'u2',
  memberships: [{ team_id: 't1', team_name: 'Mettle FC', role: 'ATHLETE' }],
  active_team_id: 't1',
}

const inviteResponse = {
  code: 'ABC123',
  join_url: 'https://app.com/join?code=ABC123',
  team_id: 't1',
}

/**
 * Sets up mockRequest so that:
 * - GET  /v1/me       → coachMe   (all calls, incl. re-runs from strict-mode effects)
 * - POST /v1/invites  → inviteResponse
 */
function setupCoachWithInvite() {
  mockRequest.mockImplementation((path: string) =>
    path === '/v1/invites'
      ? Promise.resolve(inviteResponse)
      : Promise.resolve(coachMe),
  )
}

// ---------------------------------------------------------------------------

describe('TeamPage', () => {
  it('renders loading state initially', () => {
    mockRequest.mockReturnValue(new Promise(() => {})) // never resolves
    render(<TeamPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders team name and role for a coach', async () => {
    mockRequest.mockResolvedValue(coachMe)
    render(<TeamPage />)
    expect(await screen.findByText('Mettle FC')).toBeInTheDocument()
    expect(screen.getByText('coach')).toBeInTheDocument()
  })

  it('renders team name and role for an athlete', async () => {
    mockRequest.mockResolvedValue(athleteMe)
    render(<TeamPage />)
    expect(await screen.findByText('Mettle FC')).toBeInTheDocument()
    expect(screen.getByText('athlete')).toBeInTheDocument()
  })

  it('shows the invite panel only for a coach', async () => {
    mockRequest.mockResolvedValue(coachMe)
    render(<TeamPage />)
    expect(
      await screen.findByRole('button', { name: /generate invite link/i }),
    ).toBeInTheDocument()
  })

  it('does not show the invite panel for an athlete', async () => {
    mockRequest.mockResolvedValue(athleteMe)
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(
      screen.queryByRole('button', { name: /generate invite link/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the invite URL after clicking generate', async () => {
    setupCoachWithInvite()
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(
      await screen.findByDisplayValue('https://app.com/join?code=ABC123'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate new link/i })).toBeInTheDocument()
  })

  it('copies the invite URL to clipboard when Copy is clicked', async () => {
    setupCoachWithInvite()
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))
    fireEvent.click(await screen.findByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('https://app.com/join?code=ABC123')
    })
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows an error message if invite generation fails', async () => {
    mockRequest.mockImplementation((path: string) =>
      path === '/v1/invites'
        ? Promise.reject(new Error('Server error'))
        : Promise.resolve(coachMe),
    )
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i)
  })

  it('shows empty state when user has no memberships', async () => {
    mockRequest.mockResolvedValue({ user_id: 'u3', memberships: [], active_team_id: null })
    render(<TeamPage />)
    expect(await screen.findByText(/no team found/i)).toBeInTheDocument()
  })

  it('redirects to /login on UnauthorizedError', async () => {
    const { UnauthorizedError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValue(new UnauthorizedError())
    render(<TeamPage />)
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/login')
    })
  })
})
