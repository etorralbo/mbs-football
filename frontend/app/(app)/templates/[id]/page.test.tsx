import { render, screen, cleanup, waitFor } from '@testing-library/react'
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
