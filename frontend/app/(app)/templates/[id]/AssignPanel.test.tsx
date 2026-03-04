import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AssignPanel } from './AssignPanel'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ATHLETES = [
  { athlete_id: 'a-1', display_name: 'Alice' },
  { athlete_id: 'a-2', display_name: 'Bob' },
]

const ASSIGNMENT_OK = { assignment_id: 'asgn-1', sessions_created: 3 }

// Helper: find the submit button (its label changes dynamically)
function getSubmitButton() {
  return screen.getByRole('button', { name: /assign workout|select athletes to assign/i })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// Tests — mode selection
// ---------------------------------------------------------------------------

describe('AssignPanel — mode selection', () => {
  it('defaults to team mode: no checkboxes visible', () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('switching to "Select athletes" shows a checkbox per athlete', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Alice')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Bob')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — dynamic button labels
// ---------------------------------------------------------------------------

describe('AssignPanel — dynamic button labels', () => {
  it('team mode: shows "Assign workout to N athletes" when team has athletes', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    await waitFor(() => {
      expect(getSubmitButton()).toHaveTextContent('Assign workout to 2 athletes')
    })
    expect(getSubmitButton()).not.toBeDisabled()
  })

  it('team mode: disabled with generic label when team is empty', () => {
    mockRequest.mockResolvedValue([])
    render(<AssignPanel templateId="tpl-1" />)

    expect(getSubmitButton()).toBeDisabled()
    expect(getSubmitButton()).toHaveTextContent('Assign workout')
  })

  it('team mode: singular label for 1 athlete', async () => {
    mockRequest.mockResolvedValue([{ athlete_id: 'a-1', display_name: 'Solo' }])
    render(<AssignPanel templateId="tpl-1" />)

    await waitFor(() => {
      expect(getSubmitButton()).toHaveTextContent('Assign workout to 1 athlete')
    })
    // Should NOT say "athletes" (plural)
    expect(getSubmitButton().textContent).not.toMatch(/athletes/)
  })

  it('athletes mode: shows "Select athletes to assign" when none selected', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    expect(getSubmitButton()).toHaveTextContent('Select athletes to assign')
    expect(getSubmitButton()).toBeDisabled()
  })

  it('athletes mode: shows count when athletes are selected', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Alice'))
    expect(getSubmitButton()).toHaveTextContent('Assign workout to 1 athlete')
    expect(getSubmitButton().textContent).not.toMatch(/athletes/)

    fireEvent.click(screen.getByLabelText('Bob'))
    expect(getSubmitButton()).toHaveTextContent('Assign workout to 2 athletes')
  })
})

// ---------------------------------------------------------------------------
// Tests — helper text
// ---------------------------------------------------------------------------

describe('AssignPanel — helper text', () => {
  it('shows session count helper when team mode is submittable', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    await waitFor(() => {
      expect(screen.getByText('2 workout sessions will be created')).toBeInTheDocument()
    })
  })

  it('does not show helper when team is empty', () => {
    mockRequest.mockResolvedValue([])
    render(<AssignPanel templateId="tpl-1" />)

    expect(screen.queryByText(/workout sessions will be created/i)).toBeNull()
  })

  it('shows helper for selected athletes', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    expect(screen.queryByText(/workout sessions will be created/i)).toBeNull()

    fireEvent.click(screen.getByLabelText('Alice'))
    expect(screen.getByText('1 workout session will be created')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — selection controls
// ---------------------------------------------------------------------------

describe('AssignPanel — selection controls', () => {
  it('Assign is disabled until at least one athlete is checked', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    expect(getSubmitButton()).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Alice'))

    expect(getSubmitButton()).not.toBeDisabled()
  })

  it('"Select all" checks every athlete', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByText('Select all')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Select all'))

    expect(screen.getByLabelText('Alice')).toBeChecked()
    expect(screen.getByLabelText('Bob')).toBeChecked()
  })

  it('"Clear" unchecks all athletes', async () => {
    mockRequest.mockResolvedValue(ATHLETES)
    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByText('Select all')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Select all'))
    fireEvent.click(screen.getByText('Clear'))

    expect(screen.getByLabelText('Alice')).not.toBeChecked()
    expect(screen.getByLabelText('Bob')).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// Tests — team submit
// ---------------------------------------------------------------------------

describe('AssignPanel — team submit', () => {
  it('calls POST once with type:team and shows success message', async () => {
    mockRequest
      .mockResolvedValueOnce(ATHLETES)       // GET /v1/athletes
      .mockResolvedValueOnce(ASSIGNMENT_OK)  // POST /v1/workout-assignments

    render(<AssignPanel templateId="tpl-1" />)

    // Wait for athletes to load so the Assign button becomes enabled
    await waitFor(() => {
      expect(getSubmitButton()).not.toBeDisabled()
    })

    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/whole team/i)
    })
    expect(screen.getByRole('status')).toHaveTextContent('3 sessions created')
    expect(screen.getByRole('link', { name: /go to sessions/i })).toBeInTheDocument()

    expect(mockRequest).toHaveBeenCalledWith(
      '/v1/workout-assignments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          workout_template_id: 'tpl-1',
          target: { type: 'team' },
          scheduled_for: new Date().toLocaleDateString('en-CA'),
        }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Tests — athletes submit
// ---------------------------------------------------------------------------

describe('AssignPanel — athletes submit', () => {
  it('calls POST for each selected athlete and shows aggregate summary', async () => {
    mockRequest
      .mockResolvedValueOnce(ATHLETES)
      .mockResolvedValueOnce({ assignment_id: 'asgn-1', sessions_created: 2 })
      .mockResolvedValueOnce({ assignment_id: 'asgn-2', sessions_created: 3 })

    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Alice'))
    fireEvent.click(screen.getByLabelText('Bob'))
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 athletes')
    })
    expect(screen.getByRole('status')).toHaveTextContent('5 sessions created')
    expect(screen.getByRole('link', { name: /go to sessions/i })).toBeInTheDocument()
  })

  it('shows partial-failure suffix when some calls fail', async () => {
    mockRequest
      .mockResolvedValueOnce(ATHLETES)
      .mockResolvedValueOnce({ assignment_id: 'asgn-1', sessions_created: 2 }) // Alice OK
      .mockRejectedValueOnce(new Error('network'))                              // Bob fails

    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Alice'))
    fireEvent.click(screen.getByLabelText('Bob'))
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('(1 failed)')
    })
  })

  it('shows error banner when all assignments fail', async () => {
    mockRequest
      .mockResolvedValueOnce(ATHLETES)
      .mockRejectedValue(new Error('network'))

    render(<AssignPanel templateId="tpl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /select athletes/i }))
    await waitFor(() => expect(screen.getByLabelText('Alice')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Alice'))
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/all assignments failed/i)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
