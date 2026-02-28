import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import TeamPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth, mockRequest, mockWriteText, mockRouter } = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    mockUseAuth: vi.fn(),
    mockRequest: vi.fn(),
    mockWriteText: vi.fn().mockResolvedValue(undefined),
    mockRouter: { replace },
  }
})

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

// FunnelStatsCard makes its own analytics requests — stub it so team page
// tests don't need to handle /v1/analytics/funnel.
vi.mock('@/src/features/analytics/FunnelStatsCard', () => ({
  FunnelStatsCard: () => null,
}))

// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  })
})

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
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

function authAs(me: typeof coachMe | typeof athleteMe | null, role: 'COACH' | 'ATHLETE' | null) {
  mockUseAuth.mockReturnValue({
    me,
    role,
    activeTeamId: me?.active_team_id ?? null,
    loading: false,
    error: null,
    refreshMe: vi.fn(),
  })
}

// ---------------------------------------------------------------------------

describe('TeamPage', () => {
  it('renders loading state when auth is loading', () => {
    mockUseAuth.mockReturnValue({
      me: null, role: null, activeTeamId: null, loading: true, error: null, refreshMe: vi.fn(),
    })
    render(<TeamPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders team name and role for a coach', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    expect(await screen.findByText('Mettle FC')).toBeInTheDocument()
    expect(screen.getByText('coach')).toBeInTheDocument()
  })

  it('renders team name and role for an athlete', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    // Athlete guard fires a redirect, but the page still renders briefly.
    expect(await screen.findByText('Mettle FC')).toBeInTheDocument()
    expect(screen.getByText('athlete')).toBeInTheDocument()
  })

  it('shows the invite panel only for a coach', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    expect(
      await screen.findByRole('button', { name: /generate invite link/i }),
    ).toBeInTheDocument()
  })

  it('does not show the invite panel for an athlete', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(
      screen.queryByRole('button', { name: /generate invite link/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the invite URL after clicking generate', async () => {
    authAs(coachMe, 'COACH')
    mockRequest.mockResolvedValue(inviteResponse)
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(
      await screen.findByDisplayValue('https://app.com/join?code=ABC123'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate new link/i })).toBeInTheDocument()
  })

  it('copies the invite URL to clipboard when Copy is clicked', async () => {
    authAs(coachMe, 'COACH')
    mockRequest.mockResolvedValue(inviteResponse)
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))
    fireEvent.click(await screen.findByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('https://app.com/join?code=ABC123')
    })
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows an error message if invite generation fails', async () => {
    authAs(coachMe, 'COACH')
    mockRequest.mockRejectedValue(new Error('Server error'))
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i)
  })

  it('shows empty state when user has no memberships', async () => {
    mockUseAuth.mockReturnValue({
      me: { user_id: 'u3', memberships: [], active_team_id: null },
      role: null, activeTeamId: null, loading: false, error: null, refreshMe: vi.fn(),
    })
    render(<TeamPage />)
    expect(await screen.findByText(/no team found/i)).toBeInTheDocument()
  })

  it('redirects ATHLETE to /sessions', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/sessions'))
  })
})
