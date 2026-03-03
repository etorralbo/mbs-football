/**
 * Guard tests for /templates page.
 *
 * 1. ATHLETE is redirected to /sessions (UX guard — backend RBAC is the real authority).
 * 2. COACH can access the page (no redirect).
 */
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import TemplatesPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth, mockPush, mockRequest } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockPush: vi.fn(),
  mockRequest: vi.fn(),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockPush, push: mockPush }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

// useActivationState is called by TemplatesPage for role-based empty states.
// Stub it out so tests don't hit /v1/me.
vi.mock('@/src/features/activation/useActivationState', () => ({
  useActivationState: () => ({ role: 'COACH', steps: [], nextAction: null, isLoading: false, error: null }),
}))

// AiDraftPanel makes its own requests — stub it out for guard tests.
vi.mock('./AiDraftPanel', () => ({ AiDraftPanel: () => null }))

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
  mockPush.mockReset()
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplatesPage — ATHLETE guard', () => {
  it('redirects ATHLETE to /sessions once loading is false', async () => {
    mockUseAuth.mockReturnValue({
      role: 'ATHLETE', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest.mockResolvedValue([]) // templates list

    render(<TemplatesPage />)

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/sessions'))
  })

  it('does not redirect while auth is still loading', () => {
    mockUseAuth.mockReturnValue({
      role: null, loading: true, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest.mockResolvedValue([])

    render(<TemplatesPage />)

    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('TemplatesPage — COACH access', () => {
  it('does NOT redirect COACH', async () => {
    mockUseAuth.mockReturnValue({
      role: 'COACH', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest.mockResolvedValue([])

    render(<TemplatesPage />)

    // Wait for loading to settle, then assert no redirect
    await screen.findByText(/workout templates/i)
    expect(mockPush).not.toHaveBeenCalledWith('/sessions')
  })
})

describe('TemplatesPage — New Template form', () => {
  function renderAsCoach() {
    mockUseAuth.mockReturnValue({
      role: 'COACH', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest.mockResolvedValue([])
    return render(<TemplatesPage />)
  }

  it('shows "+ New Template" button for COACH', async () => {
    renderAsCoach()
    await screen.findByText(/workout templates/i)
    expect(screen.getByRole('button', { name: /\+ new template/i })).toBeInTheDocument()
  })

  it('toggles inline form when "+ New Template" is clicked', async () => {
    renderAsCoach()
    await screen.findByText(/workout templates/i)

    fireEvent.click(screen.getByRole('button', { name: /\+ new template/i }))

    expect(screen.getByLabelText(/template title/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument()
  })

  it('shows validation error when title is fewer than 3 chars', async () => {
    renderAsCoach()
    await screen.findByText(/workout templates/i)

    fireEvent.click(screen.getByRole('button', { name: /\+ new template/i }))
    const input = screen.getByLabelText(/template title/i)
    fireEvent.change(input, { target: { value: 'AB' } })
    fireEvent.submit(input.closest('form')!)

    await screen.findByText(/at least 3 characters/i)
    expect(mockRequest).not.toHaveBeenCalledWith(
      '/v1/workout-templates',
      expect.anything(),
    )
  })

  it('navigates to template detail after creation', async () => {
    mockUseAuth.mockReturnValue({
      role: 'COACH', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest
      .mockResolvedValueOnce([])  // list fetch
      .mockResolvedValueOnce({ id: 'new-tpl', title: 'Leg Day', status: 'draft', team_id: 't1', description: null, created_at: '', updated_at: '' })  // POST

    render(<TemplatesPage />)

    await screen.findByText(/workout templates/i)
    fireEvent.click(screen.getByRole('button', { name: /\+ new template/i }))

    const input = screen.getByLabelText(/template title/i)
    fireEvent.change(input, { target: { value: 'Leg Day' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/templates/new-tpl')
    })
  })
})
