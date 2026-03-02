import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/app/_shared/api/httpClient', () => ({
  request: vi.fn(),
}))

vi.mock('@/src/features/activation/useActivationState', () => ({
  useActivationState: vi.fn(),
}))

import { request } from '@/app/_shared/api/httpClient'
import { useActivationState } from '@/src/features/activation/useActivationState'
import SessionsPage from './page'

const mockRequest = vi.mocked(request)
const mockUseActivationState = vi.mocked(useActivationState)

const baseActivationState = {
  isLoading: false,
  error: null,
  steps: [],
  nextAction: null,
}

const PENDING_SESSION = {
  id: 'sess-1',
  assignment_id: 'asgn-1',
  athlete_id: 'ath-1',
  workout_template_id: 'tpl-1',
  template_title: 'Power Session',
  athlete_name: 'Alice Athlete',
  scheduled_for: null,
  completed_at: null,
}

const COMPLETED_SESSION = {
  ...PENDING_SESSION,
  id: 'sess-2',
  athlete_id: 'ath-2',
  template_title: 'Speed Session',
  athlete_name: 'Bob Athlete',
  completed_at: '2026-02-01T10:00:00Z',
}

const ACTIVATION_ATHLETE = { isLoading: false, error: null, steps: [], nextAction: null, role: 'ATHLETE' as const }

describe('SessionsPage — session list CTAs', () => {
  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders "Start session" link for pending sessions', async () => {
    mockUseActivationState.mockReturnValue(ACTIVATION_ATHLETE)
    mockRequest.mockResolvedValue([PENDING_SESSION])

    render(<SessionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /start session/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /start session/i })).toHaveAttribute(
      'href',
      '/sessions/sess-1',
    )
  })

  it('does not render "Start session" for completed sessions', async () => {
    mockUseActivationState.mockReturnValue(ACTIVATION_ATHLETE)
    mockRequest.mockResolvedValue([COMPLETED_SESSION])

    render(<SessionsPage />)

    await waitFor(() => expect(screen.queryByRole('link', { name: /start session/i })).toBeNull())
  })

  it('renders "View" link for completed sessions', async () => {
    mockUseActivationState.mockReturnValue(ACTIVATION_ATHLETE)
    mockRequest.mockResolvedValue([COMPLETED_SESSION])

    render(<SessionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute(
        'href',
        '/sessions/sess-2',
      )
    })
  })

  it('renders both CTAs in a mixed list', async () => {
    mockUseActivationState.mockReturnValue(ACTIVATION_ATHLETE)
    mockRequest.mockResolvedValue([PENDING_SESSION, COMPLETED_SESSION])

    render(<SessionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /start session/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /view/i })).toBeInTheDocument()
  })

  it('renders "View →" for pending sessions when role is COACH', async () => {
    mockUseActivationState.mockReturnValue({ ...baseActivationState, role: 'COACH' })
    mockRequest.mockResolvedValue([PENDING_SESSION])

    render(<SessionsPage />)

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /start session/i })).toBeNull()
      expect(screen.getByRole('link', { name: /view/i })).toBeInTheDocument()
    })
  })

  it('shows athlete names as section headings when role is COACH', async () => {
    mockUseActivationState.mockReturnValue({ ...baseActivationState, role: 'COACH' })
    mockRequest.mockResolvedValue([PENDING_SESSION, COMPLETED_SESSION])

    render(<SessionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /alice athlete/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /bob athlete/i })).toBeInTheDocument()
    })
  })

  it('does not show athlete name subtitle when role is ATHLETE', async () => {
    mockUseActivationState.mockReturnValue({ ...baseActivationState, role: 'ATHLETE' })
    mockRequest.mockResolvedValue([PENDING_SESSION])

    render(<SessionsPage />)

    await waitFor(() => {
      expect(screen.queryByText('Alice Athlete')).toBeNull()
    })
  })
})

describe('SessionsPage empty state', () => {
  beforeEach(() => {
    mockRequest.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('shows coach CTA when sessions are empty and role is COACH (no templates yet)', async () => {
    // steps: [] → hasTemplates = false → "create template" branch
    mockUseActivationState.mockReturnValue({ ...baseActivationState, role: 'COACH' })

    render(<SessionsPage />)

    await screen.findByText('Start by creating a template')
    expect(
      screen.getByText('Build a workout template before assigning sessions to athletes.'),
    ).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: 'Create with AI' })
    expect(cta).toBeInTheDocument()
    expect(cta).toHaveAttribute('href', '/templates')
  })

  it('shows athlete message without CTA when sessions are empty and role is ATHLETE', async () => {
    mockUseActivationState.mockReturnValue({ ...baseActivationState, role: 'ATHLETE' })

    render(<SessionsPage />)

    await screen.findByText('No sessions assigned yet')
    expect(
      screen.getByText("Your coach hasn't assigned a session to you yet. Check back soon."),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /assign/i })).toBeNull()
  })
})
