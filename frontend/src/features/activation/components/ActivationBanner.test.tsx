import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Render Next.js Link as a plain anchor — same pattern as NavBar.test.tsx
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('../useActivationState', () => ({
  useActivationState: vi.fn(),
}))

import { useActivationState } from '../useActivationState'
import { ActivationBanner } from './ActivationBanner'

const mockUseActivationState = vi.mocked(useActivationState)

const coachSteps = [
  { key: 'create_team', label: 'Create your team', completed: true, href: '/onboarding' },
  { key: 'create_template', label: 'Create first template', completed: false, href: '/templates' },
  { key: 'assign_session', label: 'Assign first session', completed: false, href: '/sessions' },
]

describe('ActivationBanner', () => {
  beforeEach(() => {
    mockUseActivationState.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the next action CTA when nextAction exists', () => {
    mockUseActivationState.mockReturnValue({
      isLoading: false,
      error: null,
      role: 'COACH',
      steps: coachSteps,
      nextAction: {
        key: 'create_template',
        label: 'Create first template',
        completed: false,
        href: '/templates',
      },
    })

    render(<ActivationBanner />)

    const cta = screen.getByTestId('activation-cta')
    expect(cta).toBeInTheDocument()
    expect(cta).toHaveAttribute('href', '/templates')
    expect(screen.getByText('1 / 3 steps completed')).toBeInTheDocument()
  })

  it('shows setup complete and hides CTA when nextAction is null', () => {
    const completedSteps = coachSteps.map((s) => ({ ...s, completed: true }))
    mockUseActivationState.mockReturnValue({
      isLoading: false,
      error: null,
      role: 'COACH',
      steps: completedSteps,
      nextAction: null,
    })

    render(<ActivationBanner />)

    expect(screen.getByText(/setup complete/i)).toBeInTheDocument()
    expect(screen.queryByTestId('activation-cta')).toBeNull()
  })

  it('renders nothing when there is an error', () => {
    mockUseActivationState.mockReturnValue({
      isLoading: false,
      error: new Error('Unauthorized'),
      role: null,
      steps: [],
      nextAction: null,
    })

    const { container } = render(<ActivationBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a loading skeleton while fetching', () => {
    mockUseActivationState.mockReturnValue({
      isLoading: true,
      error: null,
      role: null,
      steps: [],
      nextAction: null,
    })

    render(<ActivationBanner />)
    expect(screen.getByLabelText('Loading setup progress')).toBeInTheDocument()
  })
})
