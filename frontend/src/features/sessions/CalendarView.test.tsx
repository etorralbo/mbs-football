import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'
import { CalendarView } from './CalendarView'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures — dates in current month so they appear in default calendar view
// ---------------------------------------------------------------------------

const now = new Date()
const THIS_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

function makeSession(overrides: Partial<WorkoutSessionSummary> & { id: string }): WorkoutSessionSummary {
  return {
    assignment_id: `a-${overrides.id}`,
    athlete_id: 'ath-1',
    workout_template_id: 'tpl-1',
    template_title: 'Default Workout',
    athlete_name: 'Alex Morgan',
    scheduled_for: `${THIS_MONTH}-15`,
    completed_at: null,
    cancelled_at: null,
    exercise_count: 6,
    exercises_logged_count: 0,
    ...overrides,
  }
}

const SESSION_ALICE = makeSession({
  id: 'sess-alice',
  athlete_id: 'ath-alice',
  athlete_name: 'Alice Johnson',
  template_title: 'Strength Block A',
})

const SESSION_BOB = makeSession({
  id: 'sess-bob',
  athlete_id: 'ath-bob',
  athlete_name: 'Bob Smith',
  template_title: 'Cardio Day',
})

const SESSION_COMPLETED = makeSession({
  id: 'sess-done',
  athlete_id: 'ath-carol',
  athlete_name: 'Carol Williams',
  template_title: 'Recovery',
  completed_at: '2026-03-15T10:00:00Z',
})

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Step 1: Athlete name + template on cards
// ---------------------------------------------------------------------------

describe('CalendarView — session cards', () => {
  it('renders athlete name on the card', () => {
    render(<CalendarView sessions={[SESSION_ALICE]} />)
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
  })

  it('renders template title on the card', () => {
    render(<CalendarView sessions={[SESSION_ALICE]} />)
    expect(screen.getByText('Strength Block A')).toBeInTheDocument()
  })

  it('renders both athlete name and template for each session', () => {
    render(<CalendarView sessions={[SESSION_ALICE, SESSION_BOB]} />)
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText('Strength Block A')).toBeInTheDocument()
    expect(screen.getByText('Bob Smith')).toBeInTheDocument()
    expect(screen.getByText('Cardio Day')).toBeInTheDocument()
  })

  it('applies left border color per athlete', () => {
    render(<CalendarView sessions={[SESSION_ALICE]} />)
    const link = screen.getByRole('link', { name: /alice johnson/i })
    expect(link.style.borderLeftColor).toBeTruthy()
  })

  it('shows completed status styling for completed sessions', () => {
    render(<CalendarView sessions={[SESSION_COMPLETED]} />)
    const link = screen.getByRole('link', { name: /carol williams/i })
    expect(link.className).toContain('bg-emerald')
  })
})

// ---------------------------------------------------------------------------
// Step 2: +N more overflow
// ---------------------------------------------------------------------------

describe('CalendarView — overflow (+N more)', () => {
  const MANY_SESSIONS = [
    makeSession({ id: 's1', athlete_id: 'a1', athlete_name: 'Player One', template_title: 'Tpl 1' }),
    makeSession({ id: 's2', athlete_id: 'a2', athlete_name: 'Player Two', template_title: 'Tpl 2' }),
    makeSession({ id: 's3', athlete_id: 'a3', athlete_name: 'Player Three', template_title: 'Tpl 3' }),
    makeSession({ id: 's4', athlete_id: 'a4', athlete_name: 'Player Four', template_title: 'Tpl 4' }),
  ]

  it('shows "+N more" when more than 2 sessions on a day', () => {
    render(<CalendarView sessions={MANY_SESSIONS} />)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('only renders the first 2 sessions inline', () => {
    render(<CalendarView sessions={MANY_SESSIONS} />)
    // First 2 visible inline
    expect(screen.getByText('Player One')).toBeInTheDocument()
    expect(screen.getByText('Player Two')).toBeInTheDocument()
    // 3rd and 4th hidden until popover opens
    expect(screen.queryByText('Player Three')).not.toBeInTheDocument()
    expect(screen.queryByText('Player Four')).not.toBeInTheDocument()
  })

  it('opens popover with all sessions when "+N more" is clicked', () => {
    render(<CalendarView sessions={MANY_SESSIONS} />)
    fireEvent.click(screen.getByText('+2 more'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Player One')).toBeInTheDocument()
    expect(within(dialog).getByText('Player Two')).toBeInTheDocument()
    expect(within(dialog).getByText('Player Three')).toBeInTheDocument()
    expect(within(dialog).getByText('Player Four')).toBeInTheDocument()
  })

  it('popover shows template titles', () => {
    render(<CalendarView sessions={MANY_SESSIONS} />)
    fireEvent.click(screen.getByText('+2 more'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Tpl 1')).toBeInTheDocument()
    expect(within(dialog).getByText('Tpl 4')).toBeInTheDocument()
  })

  it('popover shows status badges', () => {
    const sessionsWithCompleted = [
      ...MANY_SESSIONS.slice(0, 2),
      makeSession({ id: 's-done', athlete_id: 'a-done', athlete_name: 'Done Athlete', template_title: 'Done Tpl', completed_at: '2026-03-15T10:00:00Z' }),
    ]
    render(<CalendarView sessions={sessionsWithCompleted} />)
    fireEvent.click(screen.getByText('+1 more'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Completed')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Scheduled').length).toBeGreaterThanOrEqual(1)
  })

  it('closes popover on Escape key', () => {
    render(<CalendarView sessions={MANY_SESSIONS} />)
    fireEvent.click(screen.getByText('+2 more'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes popover on close button click', () => {
    render(<CalendarView sessions={MANY_SESSIONS} />)
    fireEvent.click(screen.getByText('+2 more'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Step 3: Unassign from popover
// ---------------------------------------------------------------------------

describe('CalendarView — unassign actions', () => {
  it('shows unassign button for coach on pending sessions', () => {
    render(
      <CalendarView sessions={[SESSION_ALICE]} role="COACH" onUnassign={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /unassign alice johnson/i })).toBeInTheDocument()
  })

  it('does not show unassign button for athlete role', () => {
    render(
      <CalendarView sessions={[SESSION_ALICE]} role="ATHLETE" onUnassign={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument()
  })

  it('does not show unassign button for completed sessions', () => {
    render(
      <CalendarView sessions={[SESSION_COMPLETED]} role="COACH" onUnassign={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument()
  })

  it('calls onUnassign when unassign button is clicked in popover', () => {
    const onUnassign = vi.fn()
    const sessions = [
      makeSession({ id: 's1', athlete_id: 'a1', athlete_name: 'Player One', template_title: 'T1' }),
      makeSession({ id: 's2', athlete_id: 'a2', athlete_name: 'Player Two', template_title: 'T2' }),
      makeSession({ id: 's3', athlete_id: 'a3', athlete_name: 'Player Three', template_title: 'T3' }),
    ]
    render(<CalendarView sessions={sessions} role="COACH" onUnassign={onUnassign} />)

    // Open popover
    fireEvent.click(screen.getByText('+1 more'))
    const dialog = screen.getByRole('dialog')

    // Click unassign on Player Three
    fireEvent.click(within(dialog).getByRole('button', { name: /unassign player three/i }))

    expect(onUnassign).toHaveBeenCalledWith(sessions[2])
  })

  it('popover shows View links for all sessions', () => {
    const sessions = [
      makeSession({ id: 's1', athlete_id: 'a1', athlete_name: 'Player One', template_title: 'T1' }),
      makeSession({ id: 's2', athlete_id: 'a2', athlete_name: 'Player Two', template_title: 'T2' }),
      makeSession({ id: 's3', athlete_id: 'a3', athlete_name: 'Player Three', template_title: 'T3' }),
    ]
    render(<CalendarView sessions={sessions} role="COACH" onUnassign={vi.fn()} />)

    fireEvent.click(screen.getByText('+1 more'))
    const dialog = screen.getByRole('dialog')
    const viewLinks = within(dialog).getAllByText('View')
    expect(viewLinks).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Month navigation
// ---------------------------------------------------------------------------

describe('CalendarView — navigation', () => {
  it('shows current month label', () => {
    render(<CalendarView sessions={[]} />)
    const expected = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('navigates to previous month', () => {
    render(<CalendarView sessions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }))
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const expected = prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('navigates to next month', () => {
    render(<CalendarView sessions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const expected = next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
