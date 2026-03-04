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

vi.mock('./ExercisePicker', () => ({
  ExercisePicker: ({ blockId, onClose }: { blockId: string; onClose: () => void }) => (
    <div data-testid="exercise-picker" data-block-id={blockId}>
      <button onClick={onClose}>Close picker</button>
    </div>
  ),
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

describe('TemplateDetailPage — status toggle', () => {
  it('shows "Publish" button when status is draft', async () => {
    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    })
  })

  it('shows "Convert to draft" button when status is published', async () => {
    mockRequest.mockResolvedValueOnce({ ...MOCK_TEMPLATE, status: 'published' })

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert to draft' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
  })

  it('toggles to "Convert to draft" after publishing', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_TEMPLATE)  // GET
      .mockResolvedValueOnce({ ...MOCK_TEMPLATE, status: 'published' })  // PATCH

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert to draft' })).toBeInTheDocument()
    })
  })
})

describe('TemplateDetailPage — block reorder (drag-and-drop)', () => {
  const TEMPLATE_WITH_BLOCKS: WorkoutTemplateDetail = {
    ...MOCK_TEMPLATE,
    blocks: [
      { id: 'b1', workout_template_id: 'tpl-123', order: 0, name: 'Warmup', notes: null, items: [] },
      { id: 'b2', workout_template_id: 'tpl-123', order: 1, name: 'Main', notes: null, items: [] },
    ],
  }

  it('shows drag handles in edit mode', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCKS)

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Warmup').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))

    expect(screen.getByLabelText(/drag to reorder warmup/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/drag to reorder main/i)).toBeInTheDocument()
  })

  it('does not show drag handles in view mode', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCKS)

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Warmup').length).toBeGreaterThan(0)
    })

    expect(screen.queryByLabelText(/drag to reorder/i)).not.toBeInTheDocument()
  })
})

describe('TemplateDetailPage — exercise picker drawer', () => {
  const TEMPLATE_WITH_BLOCK: WorkoutTemplateDetail = {
    ...MOCK_TEMPLATE,
    blocks: [
      { id: 'b1', workout_template_id: 'tpl-123', order: 0, name: 'Warmup', notes: null, items: [] },
    ],
  }

  it('opens exercise picker drawer when Browse library is clicked in edit mode', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCK)

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Warmup').length).toBeGreaterThan(0)
    })

    // Enter edit mode
    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))

    // Click "Browse library" button
    fireEvent.click(screen.getByRole('button', { name: /browse library/i }))

    // Exercise picker drawer should appear with correct blockId
    expect(screen.getByTestId('exercise-picker')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-picker')).toHaveAttribute('data-block-id', 'b1')
  })

  it('does not show exercise picker drawer by default', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCK)

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Warmup').length).toBeGreaterThan(0)
    })

    expect(screen.queryByTestId('exercise-picker')).not.toBeInTheDocument()
  })

  it('closes exercise picker drawer when close is triggered', async () => {
    mockRequest.mockResolvedValueOnce(TEMPLATE_WITH_BLOCK)

    render(<TemplateDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Warmup').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))
    fireEvent.click(screen.getByRole('button', { name: /browse library/i }))

    expect(screen.getByTestId('exercise-picker')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close picker/i }))

    expect(screen.queryByTestId('exercise-picker')).not.toBeInTheDocument()
  })
})
