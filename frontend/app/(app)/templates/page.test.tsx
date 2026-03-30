/**
 * Tests for /templates page.
 *
 * 1. ATHLETE is redirected to /sessions (UX guard — backend RBAC is the real authority).
 * 2. COACH can access the page (no redirect).
 * 3. "New Template" dropdown opens drawer for manual creation.
 * 4. Template cards show kebab menu with Duplicate / Delete actions.
 * 5. Duplicate highlights the new card inline.
 * 6. Cards show "Last edited" metadata.
 * 7. Quick actions (Edit, Assign, Duplicate) appear on hover.
 */
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import TemplatesPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth, mockPush, mockRequest, stableRouter } = vi.hoisted(() => {
  const push = vi.fn()
  return {
    mockUseAuth: vi.fn(),
    mockPush: push,
    mockRequest: vi.fn(),
    stableRouter: { replace: push, push },
  }
})

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/src/features/activation/useActivationState', () => ({
  useActivationState: () => ({ role: 'COACH', steps: [], nextAction: null, isLoading: false, error: null }),
}))

vi.mock('./AiDraftPanel', () => ({ AiDraftPanel: () => null }))

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
  mockPush.mockReset()
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString()

function renderAsCoach(templates: unknown[] = []) {
  mockUseAuth.mockReturnValue({
    role: 'COACH', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
  })
  mockRequest.mockResolvedValue(templates)
  return render(<TemplatesPage />)
}

async function openDrawerViaScratch() {
  await screen.findByText(/workout templates/i)
  // Header "New Template" button — use first match (EmptyState may also render one)
  fireEvent.click(screen.getAllByRole('button', { name: /new template/i })[0])
  fireEvent.click(screen.getByRole('menuitem', { name: /start from scratch/i }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplatesPage — ATHLETE guard', () => {
  it('redirects ATHLETE to /sessions once loading is false', async () => {
    mockUseAuth.mockReturnValue({
      role: 'ATHLETE', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest.mockResolvedValue([])

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
    renderAsCoach()

    await screen.findByText(/workout templates/i)
    expect(mockPush).not.toHaveBeenCalledWith('/sessions')
  })
})

describe('TemplatesPage — New Template dropdown', () => {
  it('shows "New Template" button for COACH', async () => {
    renderAsCoach()
    await screen.findByText(/workout templates/i)
    expect(screen.getAllByRole('button', { name: /new template/i })[0]).toBeInTheDocument()
  })

  it('opens dropdown with "Start from scratch" and "Generate with AI"', async () => {
    renderAsCoach()
    await screen.findByText(/workout templates/i)

    fireEvent.click(screen.getAllByRole('button', { name: /new template/i })[0])

    expect(screen.getByRole('menuitem', { name: /start from scratch/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /generate with ai/i })).toBeInTheDocument()
  })
})

describe('TemplatesPage — New Template drawer', () => {
  it('opens drawer when "Start from scratch" is clicked', async () => {
    renderAsCoach()
    await openDrawerViaScratch()

    expect(screen.getByRole('dialog', { name: /new template/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/template title/i)).toBeInTheDocument()
  })

  it('shows validation error when title is fewer than 3 chars', async () => {
    renderAsCoach()
    await openDrawerViaScratch()

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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'new-tpl', title: 'Leg Day', status: 'draft', team_id: 't1', description: null, created_at: NOW, updated_at: NOW })

    render(<TemplatesPage />)
    await openDrawerViaScratch()

    const input = screen.getByLabelText(/template title/i)
    fireEvent.change(input, { target: { value: 'Leg Day' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/templates/new-tpl')
    })
  })
})

describe('TemplatesPage — Template cards', () => {
  const TEMPLATES = [
    { id: 't1', title: 'Strength A', status: 'draft', team_id: 'team1', description: null, created_at: NOW, updated_at: NOW },
    { id: 't2', title: 'Speed B', status: 'published', team_id: 'team1', description: 'Speed drills', created_at: NOW, updated_at: NOW },
  ]

  it('renders all template cards', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    expect(screen.getByText('Speed B')).toBeInTheDocument()
  })

  it('cards link to template detail page', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    expect(screen.getByRole('link', { name: /strength a/i })).toHaveAttribute('href', '/templates/t1')
    expect(screen.getByRole('link', { name: /speed b/i })).toHaveAttribute('href', '/templates/t2')
  })

  it('shows "Last edited" metadata on cards', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    const labels = screen.getAllByText(/last edited/i)
    expect(labels.length).toBe(2)
  })

  it('kebab menu shows Duplicate and Delete options', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    const kebabs = screen.getAllByRole('button', { name: /template actions/i })
    fireEvent.click(kebabs[0])

    expect(screen.getByRole('menuitem', { name: /duplicate/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
  })

  it('duplicate adds card to grid and highlights it', async () => {
    mockUseAuth.mockReturnValue({
      role: 'COACH', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest
      .mockResolvedValueOnce(TEMPLATES)
      .mockResolvedValueOnce({ id: 'dup-1', title: 'Strength A (copy)', status: 'draft', team_id: 'team1', description: null, created_at: NOW, updated_at: NOW })

    render(<TemplatesPage />)

    await screen.findByText('Strength A')
    const kebabs = screen.getAllByRole('button', { name: /template actions/i })
    fireEvent.click(kebabs[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /duplicate/i }))

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/v1/workout-templates', {
        method: 'POST',
        body: JSON.stringify({ title: 'Strength A (copy)' }),
      })
    })

    // Card appears in the grid with highlight
    const dupCard = await screen.findByText('Strength A (copy)')
    expect(dupCard.closest('[data-highlight]')).toHaveAttribute('data-highlight', 'true')
  })

  it('delete removes the template from the grid', async () => {
    mockUseAuth.mockReturnValue({
      role: 'COACH', loading: false, me: null, activeTeamId: null, error: null, refreshMe: vi.fn(),
    })
    mockRequest
      .mockResolvedValueOnce(TEMPLATES)
      .mockResolvedValueOnce(undefined) // DELETE response

    render(<TemplatesPage />)

    await screen.findByText('Strength A')
    const kebabs = screen.getAllByRole('button', { name: /template actions/i })
    fireEvent.click(kebabs[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/v1/workout-templates/t1', {
        method: 'DELETE',
      })
      expect(screen.queryByText('Strength A')).not.toBeInTheDocument()
    })
  })
})

describe('TemplatesPage — quick actions on hover', () => {
  const TEMPLATES = [
    { id: 't1', title: 'Strength A', status: 'draft', team_id: 'team1', description: null, created_at: NOW, updated_at: NOW },
  ]

  it('renders Edit, Assign, and Duplicate quick action buttons', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^assign$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^duplicate$/i })).toBeInTheDocument()
  })

  it('Edit quick action navigates to template detail', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))

    expect(mockPush).toHaveBeenCalledWith('/templates/t1')
  })

  it('Assign quick action navigates to template detail with assign param', async () => {
    renderAsCoach(TEMPLATES)

    await screen.findByText('Strength A')
    fireEvent.click(screen.getByRole('button', { name: /^assign$/i }))

    expect(mockPush).toHaveBeenCalledWith('/templates/t1?assign=true')
  })
})


describe('TemplatesPage — empty state', () => {
  it('shows improved empty state for COACH', async () => {
    renderAsCoach()

    await screen.findByText(/you don.t have any templates yet/i)
    expect(screen.getByText(/templates help you design/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create your first template/i })).toBeInTheDocument()
  })
})
