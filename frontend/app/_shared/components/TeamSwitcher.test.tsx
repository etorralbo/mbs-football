import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamSwitcher } from './TeamSwitcher'

const { mockUseAuth, mockRefresh, mockReplace, mockPathname } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockRefresh: vi.fn(),
  mockReplace: vi.fn(),
  mockPathname: vi.fn(),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace }),
  usePathname: () => mockPathname(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

afterEach(() => {
  mockUseAuth.mockReset()
  mockRefresh.mockReset()
  mockReplace.mockReset()
  mockPathname.mockReset()
})

const TEAM_A = '11111111-1111-1111-1111-111111111111'
const TEAM_B = '22222222-2222-2222-2222-222222222222'

it('renders for coach and switches team', () => {
  const setActiveTeamId = vi.fn()
  mockPathname.mockReturnValue('/home')
  mockUseAuth.mockReturnValue({
    role: 'COACH',
    activeTeamId: TEAM_A,
    setActiveTeamId,
    me: {
      memberships: [
        { team_id: TEAM_A, team_name: 'Mettle FC', role: 'COACH' },
        { team_id: TEAM_B, team_name: 'Elite FC', role: 'COACH' },
      ],
    },
  })

  render(<TeamSwitcher />)

  fireEvent.click(screen.getByRole('button', { name: /active team: mettle fc/i }))
  fireEvent.click(screen.getByRole('option', { name: /elite fc/i }))

  expect(setActiveTeamId).toHaveBeenCalledWith(TEAM_B)
  // Page content remounts via key={activeTeamId} in TeamPageContent — no explicit router.refresh() needed.
  expect(mockRefresh).not.toHaveBeenCalled()
})

it('does not render for athlete', () => {
  mockPathname.mockReturnValue('/home')
  mockUseAuth.mockReturnValue({
    role: 'ATHLETE',
    activeTeamId: TEAM_A,
    setActiveTeamId: vi.fn(),
    me: { memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'ATHLETE' }] },
  })

  const { container } = render(<TeamSwitcher />)
  expect(container).toBeEmptyDOMElement()
})
