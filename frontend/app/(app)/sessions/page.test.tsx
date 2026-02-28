import { render, screen, cleanup } from '@testing-library/react'
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

vi.mock('@/src/features/activation/components/ActivationBanner', () => ({
  ActivationBanner: () => null,
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

describe('SessionsPage empty state', () => {
  beforeEach(() => {
    mockRequest.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('shows coach CTA when sessions are empty and role is COACH', async () => {
    mockUseActivationState.mockReturnValue({ ...baseActivationState, role: 'COACH' })

    render(<SessionsPage />)

    await screen.findByText('No sessions assigned yet')
    expect(
      screen.getByText('Assign your first session to activate your team.'),
    ).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: 'Assign first session' })
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
