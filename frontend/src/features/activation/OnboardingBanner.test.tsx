import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { OnboardingBanner } from './OnboardingBanner'
import type { ActivationStep } from './activationRules'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const STEPS: ActivationStep[] = [
  { key: 'create_team', label: 'Create your team', completed: true, href: '/onboarding' },
  { key: 'create_template', label: 'Create first template', completed: false, href: '/templates' },
  { key: 'assign_session', label: 'Assign first session', completed: false, href: '/sessions' },
]

const NEXT_ACTION = STEPS[1]

afterEach(() => {
  cleanup()
})

describe('OnboardingBanner — rendering', () => {
  it('renders when nextAction is provided', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
  })

  it('renders null when nextAction is null (all done)', () => {
    const { container } = render(<OnboardingBanner steps={STEPS} nextAction={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows progress count', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    expect(screen.getByText('1 / 3 complete')).toBeInTheDocument()
  })

  it('renders all step labels', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    expect(screen.getByText('Create your team')).toBeInTheDocument()
    // 'Create first template' appears in the step list AND the CTA link
    expect(screen.getAllByText('Create first template').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Assign first session')).toBeInTheDocument()
  })

  it('applies line-through to completed steps', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    const completedLabel = screen.getByText('Create your team')
    expect(completedLabel.className).toContain('line-through')
  })

  it('CTA link points to nextAction href', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    const link = screen.getByRole('link', { name: /create first template/i })
    expect(link).toHaveAttribute('href', '/templates')
  })
})

describe('OnboardingBanner — dismiss (in-memory only)', () => {
  it('hides the banner for the current render when dismiss is clicked', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)

    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('region', { name: /getting started/i })).toBeNull()
  })

  it('does NOT write to sessionStorage on dismiss', () => {
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    // sessionStorage must stay empty — no persistence
    expect(sessionStorage.length).toBe(0)
  })

  it('shows the banner again on a fresh mount (no persistence)', () => {
    const { unmount } = render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    unmount()

    // Re-mount simulates returning to the dashboard
    render(<OnboardingBanner steps={STEPS} nextAction={NEXT_ACTION} />)
    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
  })
})
