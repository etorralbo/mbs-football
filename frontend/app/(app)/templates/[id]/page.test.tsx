import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { WorkoutTemplateDetail } from '@/app/_shared/api/types'
import TemplateDetailPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockReplace, mockUseSearchParams, mockUseRouter } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockReplace: vi.fn(),
  mockUseSearchParams: vi.fn(),
  mockUseRouter: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('./AssignPanel', () => ({
  AssignPanel: () => <div data-testid="assign-panel" />,
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tpl-123' }),
  usePathname: () => '/templates/tpl-123',
  useRouter: mockUseRouter,
  useSearchParams: mockUseSearchParams,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_TEMPLATE: WorkoutTemplateDetail = {
  id: 'tpl-123',
  team_id: 'team-1',
  title: 'Power Session',
  description: null,
  status: 'draft',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  blocks: [],
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseRouter.mockReturnValue({ replace: mockReplace })
  mockUseSearchParams.mockReturnValue({ get: () => null })
  mockRequest.mockResolvedValue(MOCK_TEMPLATE)
})

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockReplace.mockReset()
  mockUseSearchParams.mockReset()
  mockUseRouter.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateDetailPage — fromAi banner', () => {
  it('shows the banner when fromAi=1', async () => {
    mockUseSearchParams.mockReturnValue({ get: (k: string) => (k === 'fromAi' ? '1' : null) })

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Template saved' })).toBeInTheDocument()
    })
    expect(screen.getByText(/next step: assign it to your athletes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /assign now/i })).toBeInTheDocument()
  })

  it('does not show the banner when fromAi param is absent', async () => {
    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Power Session' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('status', { name: 'Template saved' })).toBeNull()
  })

  it('calls router.replace(pathname) to clean up the URL when fromAi=1', async () => {
    mockUseSearchParams.mockReturnValue({ get: (k: string) => (k === 'fromAi' ? '1' : null) })

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/templates/tpl-123')
    })
  })
})

describe('TemplateDetailPage — status badge and publish', () => {
  it('shows "Draft" badge when status is draft', async () => {
    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    expect(screen.queryByText('Published')).toBeNull()
  })

  it('shows "Publish" button when status is draft', async () => {
    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    })
  })

  it('hides Draft badge and Publish button when status is published', async () => {
    mockRequest.mockResolvedValueOnce({ ...MOCK_TEMPLATE, status: 'published' })

    render(<TemplateDetailPage />)

    // Wait for the template to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Power Session' })).toBeInTheDocument()
    })
    // No Draft badge, no Publish button when already published
    expect(screen.queryByText('Draft')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
  })

  it('publishes optimistically when Publish is clicked', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_TEMPLATE)  // GET
      .mockResolvedValueOnce({ ...MOCK_TEMPLATE, status: 'published' })  // PATCH

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    // Optimistic update: Draft badge and Publish button disappear immediately
    await waitFor(() => {
      expect(screen.queryByText('Draft')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    })
  })
})

describe('TemplateDetailPage — block reorder', () => {
  const TEMPLATE_WITH_BLOCKS: WorkoutTemplateDetail = {
    ...MOCK_TEMPLATE,
    blocks: [
      { id: 'b1', workout_template_id: 'tpl-123', order: 0, name: 'Warmup', notes: null, items: [] },
      { id: 'b2', workout_template_id: 'tpl-123', order: 1, name: 'Main', notes: null, items: [] },
    ],
  }

  it('shows reorder buttons in edit mode', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCKS)

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Warmup')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))

    // Each block has ↑ and ↓ buttons
    expect(screen.getByRole('button', { name: /move warmup up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /move warmup down/i })).toBeInTheDocument()
  })

  it('first block ↑ is disabled, last block ↓ is disabled', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCKS)

    render(<TemplateDetailPage />)

    await screen.findByText('Warmup')
    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))

    expect(screen.getByRole('button', { name: /move warmup up/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move main down/i })).toBeDisabled()
  })
})
